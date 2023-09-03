const vscode = require('vscode');
var watcher


/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
	var expression_tokens = {
		"events": [],
		"functions": [],
		"operators": [],
		"parameters": [],
		"gcodes": [],
		"mcodes": [],
		"comments": [],
		"owords": [],
		"macros": []
	}

	const fs = require('fs/promises')

	const reg_WordBoundary = new RegExp("((?:_\\w*)|(?:#\\w*)|(?:\\w+\\s*[\\(\\[]?)|(?:'[^']*')|(?:;[^\\n]*))");
	//const reg_WordBoundary_Gcode = new RegExp("((?:/<#\\w+/|/>)|(?:O/<\\w*/>?)|(?:o/<\\w+/>)|(?:/<#\\.+?#/>)|(?:\\w+)|(?:'[^']*')|(?:;[^\\n]*))");
	//const reg_WordBoundary_Gcode = new RegExp('(\\(\\w*)|(#\\<_?\\w*\\|?>?)|(^\\s*O<)|(o\\<\\w+\\>)|(\\<#.+\\>?)|(\\b\\w+\\b)|(\'[^\']*\')|(;[^\\n]*)');
	const reg_WordBoundary_Gcode = new RegExp('(G[0-9]+\\.?[0-9]+)|([GM][0-9]+[^.])|(\\(.*,)|(;.*)|(#<\\w+(||>))|(o<\\w+>\\s*\\w+\\b)|(\\b\\w+\\b)', 'i')
	const reg_GCode = new RegExp("\\b[G|M|g|m][0-9]+\\b");
	const reg_token_globalParameter = RegExp('(?<token>_\\w+)\\W(?<value>[0-9.-]*)', 'gmi')

	const reg_GCodeNormalize = new RegExp('(?<=M)0*(?=[0-9]+)|(?<=\\w)\\s*(?=[\\(\\[])', 'i')
	const reg_prefixString = new RegExp('(?<!#)<|\'', 'imsg')
	const reg_fileTypeMCode = new RegExp('(?:scripts/)(?<mcode>M[0-9]+).gcode', 'i')
	const reg_fileTypeMacro = new RegExp('(?:scripts/)(?<macro>o[0-9]+).gcode', 'i')
	const reg_fileTypeParameters = new RegExp('(?:/)(?<filename>Parameters.txt)', 'i')
	const reg_commentName = new RegExp('\\(name\\s*,\\s*\'?(?<name>.*?)\'?\\)', 'i')
	const reg_docFileArea = new RegExp(';(.*?)(?=^[^;])', 'ims')
	const reg_scriptFileNameSplit = new RegExp('(?<base>.*\\/(?<profile>.*?))\\/(?<profilerelative>scripts\\/(?<filename>(?<id>[o|M][0-9]+).gcode))', 'mi')
	const reg_getDocuContent = new RegExp('(?:.*-- wikipage start -->[\\n|\\s]*|<body>[\\n|\\s]*)(?<content>.*?)(?:<!-- wikipage stop|<\\\/body>)', 'is')
	const reg_removeComment = new RegExp('(<!--.*?-->)', 'isg');
	const reg_trimName = new RegExp('\\)?\\]?(\\s*-\\s+.*)?', 'i');
	const reg_prefix_G65 = new RegExp('\\bG65\\s*', 'i');

	function downloadFile(context, urlString) {
		return new Promise((resolve, reject) => {
			var https = require('https');
			var url = new URL(urlString)
			return https.get(url, function (res) {
				var body = '';
				res.on('data', function (chunk) {
					body += chunk;
				});
				res.on('end', function () {
					resolve(body)
				});
			}).on('error', function (e) {
				console.log("Got error: " + e.message);
				vscode.window.showErrorMessage('Searching for new data failed: ' + e.message);
				reject(e)
			});
		});

	}

	async function updateTokens(force, progress, canceltoken) {
		var txt = await fs.readFile(context.extensionPath + '\\grammars\\docUrl.json', 'utf8')
		var list = JSON.parse(txt)
		var count = 0;
		var countTotal = list.length

		progress.report({
			message: "Searching for Updates..."
		})

		for (const entry of list) {
			if (canceltoken.isCancellationRequested) { break }
			//canceltoken.onCancellationRequested(() => { return count })
			var dat = await downloadFile(context, entry['url'])
			count += parseHtmlMainFile(entry, dat, force)
			progress.report(
				{
					increment: 1 / countTotal * 100
				}
			)
		}

		return count
	}
	function parseHtmlMainFile(tokenOptions, data, force) {
		var regexp = new RegExp(tokenOptions['regex'], tokenOptions['regexMod'])
		var regexResult = [...data.matchAll(regexp)]
		var type = tokenOptions['type']
		var count = 0

		regexResult.forEach(element => {
			try {
				var found = false
				var tokenfound

				var id = element['groups']['caption']
				if (id) {
					if (element['groups']['detail']) {
						id = id + ' - ' + element['groups']['detail']
					}

					for (let X = 0; X < expression_tokens[type].length; X++) {
						const element2 = expression_tokens[type][X];
						if (element2['name'] == id) {
							found = true
							tokenfound = element2
							return
						}
					}

					if (force || !found) {
						var token
						if (found) {
							token = tokenfound
						} else {
							token = {
								"name": id
							}
						}

						var snippetstring = element['groups']['caption']
						if (snippetstring.endsWith("()")) {
							snippetstring = snippetstring.substring(0, snippetstring.length - 2) + "($1)"

						}

						token["insertText"] = snippetstring

						if (element['groups']['detail']) {
							token["detail"] = element['groups']['detail']
						}

						if (element['groups']['url']) {
							token['documentation'] = "[Documentation](" + tokenOptions['docBaseUrl'] + element['groups']['url'] + ")"
							token["docDownloadPending"] = tokenOptions['docDownloadUrlPrefix'] + element['groups']['url']
							token["documentationUrl"] = token["docDownloadPending"]
							token["documentationBaseUrl"] = tokenOptions['docBaseUrl']
						}

						if (!found) {
							expression_tokens[type].push(token)
						}
						count++;
					}
				}
			} catch (error) {
				console.log("Error during parseHtmlFile: " + error.message)
			}
		})

		return count
	}

	async function loadData(context) {
		try {
			var cacheLoaded = await load_tokens(context)
			if (!cacheLoaded) {
				var result = await fs.readFile(context.extensionPath + '\\grammars\\tokens.json', 'utf8')
				addToexpression_tokens(JSON.parse(result));
			}
		} catch (error) {
			result = error
			//TODO: Exception handling
		}

		return result
	}

	function initFileSystemWatcher() {
		return new Promise(function (resolve, reject) {
			try {
				watcher = vscode.workspace.createFileSystemWatcher("{**/*.txt,**/*.gcode,**/*.nc}");
				watcher.onDidChange(uri => {
					analyzeFile(uri)
				});
				watcher.onDidCreate(uri => {
					analyzeFile(uri)
				});
				watcher.onDidDelete(uri => {
					removeAnalyzedFile(uri)
				});
				resolve()
			} catch (error) {
				reject(error)
			}
			return Promise.resolve()
		})
	}

	function save_expression_tokens(context) {
		var enc = new TextEncoder();
		var fileUri = vscode.Uri.joinPath(context.globalStorageUri, "tokens.json");

		var expressionsFiltered = {}
		for (const [key, value] of Object.entries(expression_tokens)) {
			expressionsFiltered[key] = []
			for (const item of value) {
				if (!item.hasOwnProperty('isFromFile') && !item.hasOwnProperty('isFromFiles')) {
					expressionsFiltered[key].push(item)
				}
			}
		}

		return vscode.workspace.fs.writeFile(fileUri, enc.encode(JSON.stringify(expressionsFiltered)));
	}

	async function load_tokens(context) {
		var dec = new TextDecoder("utf-8");
		try {
			var fileUri = vscode.Uri.joinPath(context.globalStorageUri, "tokens.json");
			await vscode.workspace.fs.stat(fileUri);
			var value = await vscode.workspace.fs.readFile(fileUri)
			var data = JSON.parse(dec.decode(value));
			addToexpression_tokens(data);
			return true
		} catch (e) {
			await vscode.window.showWarningMessage('Could not load cache file. It is recommended to update the documentation files because most of the Documentation is still under devellopment and may change from time to time.', 'Update Documentation')
				.then(value => {
					if (value == 'Update Documentation') {
						updateDocumentation(false);
					}
				}

				)
			return false
		}
	}

	function addToexpression_tokens(dataObject, force) {
		for (const section of Object.keys(dataObject)) {
			if (!expression_tokens.hasOwnProperty(section)) {
				expression_tokens[section] = []
			}

			for (const item of dataObject[section]) {
				var found = false

				for (var i = 0; i < expression_tokens[section].length; i++) {
					try {
						var item2 = expression_tokens[section][i]
						if (item.hasOwnProperty('isFromFile')) {
							if (item2['name'] == item['name'] && item2.hasOwnProperty('isFromFiles')) {
								if (item2['isFromFiles'].includes(item['isFromFile'])) {
									if (force) {
										var filelist = item2['isFromFiles']
										expression_tokens[section][i] = item
										expression_tokens[section][i]['isFromFiles'] = filelist
									}
									found = true
									break;
								} else {
									if (force) {
										var filelist = item2['isFromFiles']
										expression_tokens[section][i] = item
										expression_tokens[section][i]['isFromFiles'] = filelist
									}
									expression_tokens[section][i]['isFromFiles'].push(item['isFromFile'])
									found = true
									break;
								}
							}
						} else {
							if (item2['name'] == item['name']) {
								if (force) {
									expression_tokens[section][i] = item
								}
								found = true
								break
							}
						}
					} catch (error) {
						console.log("Error during addToExpressionTokens: " + error.message)
					}

				}


				if (!found) {
					if (item.hasOwnProperty('isFromFile') && !item.hasOwnProperty('isFromFiles')) {
						item['isFromFiles'] = [item['isFromFile']]
					}
					expression_tokens[section].push(item);
				}
			}

		}
	}

	/**
	 * @param {any[]} list
	 * @param {string} token
	 * @param {vscode.CompletionItemKind} kind
	 * @param {null} [regToApply]
	 * @param {string} [prefix]
	 * @param {string} [suffix]
	 */
	async function findTokens(list, token, kind, regToApply, prefix, suffix) {
		var result = [];
		if (!prefix) { prefix = '' }
		if (!suffix) { suffix = '' }

		var tokenLow = token.toLowerCase();
		if (regToApply) {
			tokenLow = tokenLow.replace(regToApply, '');
		}

		for (const element of list) {
			try {
				// if (vscode.window.activeTextEditor && element.hasOwnProperty('isFromFiles')) {
				// 	v
				// 	var elementmatch = element['isFromFile'].match(reg_scriptFileNameSplit)
				// 	if (elementmatch) {
				// 		if (!vscode.window.activeTextEditor.document.uri.path.startsWith(elementmatch.groups['base'])) {
				// 			return
				// 		}
				// 	}
				// }
				if (!element['name']) { continue }

				var name = element['name'].toLowerCase();
				if (regToApply) {
					name = name.replace("\\(\\)$", '').replace(regToApply, '');
				}
				if (token == '' || name.includes(tokenLow) || name.startsWith(tokenLow)) {
					var item
					if (element['label']) {
						item = new vscode.CompletionItem(element['label'], kind);
					} else {
						item = new vscode.CompletionItem(element['name'], kind);
					}

					item.filterText = element['name']
					if (element['detail']) {
						item.filterText += ' - ' + element['detail']
						item.detail = element['detail']
					}

					if (element['documentationHTMLPath']) {
						var errorinUrlDownload = false
						try {
							var uri = UriFromRelativeString(context.globalStorageUri, element['documentationHTMLPath'])
							var dec = new TextDecoder("utf-8");
							var docu = dec.decode(await vscode.workspace.fs.readFile(uri))
						} catch (e) {
							var docu = 'Error while retrieving Documentation from Uri "' + uri.toString + "\n  "
							if (e instanceof Error) {
								docu += e.message
							} else {
								docu += e.toString()
							}
							errorinUrlDownload = true
						}

						var doc = new vscode.MarkdownString(docu)
						if (!errorinUrlDownload) {
							doc.supportHtml = true
						}
						if (element['documentationBaseUrl']) {
							doc.baseUri = vscode.Uri.parse(element['documentationBaseUrl'], false)
						}
						item.documentation = doc
					} else if (element['documentationHTML']) {
						var doc = new vscode.MarkdownString(element['documentationHTML'])
						doc.supportHtml = true
						if (element['documentationBaseUrl']) {
							doc.baseUri = vscode.Uri.parse(element['documentationBaseUrl'], false)
						}
						item.documentation = doc

					} else if (element['documentation']) {
						item.documentation = new vscode.MarkdownString(element['documentation'])
					}

					if (element['snippet']) {
						item.insertText = new vscode.SnippetString(prefix + element['snippet'] + suffix);
					} else if (element['insertText']) {
						var snippetstring = element['insertText']
						if (snippetstring.endsWith("()")) {
							snippetstring = snippetstring.substring(0, snippetstring.length - 2) + "($1)"
						} else if (snippetstring.endsWith("[]")) {
							snippetstring = snippetstring.substring(0, snippetstring.length - 2) + "[$1]"
						}
						item.insertText = new vscode.SnippetString(prefix + snippetstring + suffix)
					} else {
						var snippetstring = element['name']
						if (snippetstring.endsWith("()")) {
							snippetstring = snippetstring.substring(0, snippetstring.length - 2) + "($1)"
						} else if (snippetstring.endsWith("[]")) {
							snippetstring = snippetstring.substring(0, snippetstring.length - 2) + "[$1]"
						}
						item.insertText = new vscode.SnippetString(prefix + snippetstring + suffix)
					}

					result.push(item);
				}
			} catch (error) {
				vscode.window.showErrorMessage(error.message);
			}
		}
		return result;
	}

	/**
	 * @param {vscode.Uri} uri
	 */
	function removeAnalyzedFile(uri) {
		var path = uri.toString()
		for (const [key, value] of Object.entries(expression_tokens)) {
			for (let X = 0; X < expression_tokens[key].length; X++) {
				const item = expression_tokens[key][X];

				if (item.hasOwnProperty('isFromFiles') && item['isFromFiles'].includes(path)) {
					item['isFromFiles'] = item['isFromFiles'].filter(element => element !== path)
					if (item['isFromFiles'].length == 0) {
						expression_tokens[key].splice(X, 1)
						X--
					}
				}
			}
		}

		return Promise.resolve();
	}
	const TokenFileList = {}
	/**
	 * @param {vscode.Uri} uri
	 */
	async function analyzeFile(uri) {
		try {
			var item
			var filenameTrimmed = uri.fsPath
			if (filenameTrimmed.length > 20) {
				filenameTrimmed = '...' + filenameTrimmed.substring(filenameTrimmed.length - 20)
			}

			var doc = ''
			var label = null

			var dec = new TextDecoder("utf-8");
			var txt = dec.decode(await vscode.workspace.fs.readFile(uri))

			if (!txt) { return }

			// Check if name of code is specified in the file like (name,My function name) 
			var nameArrayResult = txt.match(reg_commentName)
			if (nameArrayResult && nameArrayResult.length == 2) {
				label = nameArrayResult[1]
			}

			if (uri.path.endsWith(".gcode")) {
				// use first continuous block of comments as Documentation
				var docMatch = txt.split("\n");
				var docStart = false
				for (const row of docMatch)
					if (row.startsWith(';')) {
						docStart = true
						doc += row.replace(';', '') + "\n"
					} else if (docStart) {
						break;
					}
			}

			// Detect tokens in Filename
			// Check if file is M-Code file like M12.gcode
			var match = uri.path.match(reg_fileTypeMCode)
			if (match && match.groups['mcode']) {
				item = {
					'name': match.groups['mcode'],
					'insertText': match.groups['mcode'],
					'detail': label,
					'isFromFile': uri.path
				}
				
				item['documentation'] = ''
				if (label) {
					item['documentation'] += '## ' + label + "\n" 
				}
				
				item['documentation'] += doc + "[" + filenameTrimmed + "](" + uri.toString() + ")"
				addToexpression_tokens(
					{
						"mcodes": [item]
					}
					, true)
			}

			// Check if file is macro or like o1244.gcode
			var match = uri.path.match(reg_fileTypeMacro)
			if (match && match.groups['macro']) {
				item = {
					'name': match.groups['macro'],
					'insertText': match.groups['macro'],
					'detail': label,
					'isFromFile': uri.path
				}
				item['documentation'] = ''
				if (label) {
					item['documentation'] += '## ' + label + "\n"
				}
				item['documentation'] = doc + "[" + filenameTrimmed + "](" + uri.toString() + ")"

				addToexpression_tokens(
					{
						"macros": [item]
					}
					, true)
			}

			// Detect tokens in Files
			// Read Parameters.txt file
			var tokensFound = []
			var myArray
			while ((myArray = reg_token_globalParameter.exec(txt)) !== null) {
				if (myArray['groups'] && myArray['groups']['token']) {
					if (!tokensFound.includes(myArray['groups']['token'])) {
						tokensFound.push(myArray['groups']['token'])

						item = {
							'name': myArray['groups']['token'],
							'insertText': myArray['groups']['token'],
							'detail': label,
							'isFromFile': uri.path,
							'documentation': "### " + myArray['groups']['token'] + "\n#### Global Parameter"
						}

						addToexpression_tokens(
							{
								"parameters": [item]
							}
							, false)
					}
				}
			}
		} catch (error) {
			vscode.window.showErrorMessage(error.message + ' on Analyzing file ' + uri.path)
		}
	}

	async function updateTokensFromWorkspace() {
		var files = await vscode.workspace.findFiles("{**/*.txt,**/*.gcode}")
		for (const file of files) {
			await analyzeFile(file)
		}
	}

	function downloadPendingDocu() {
		return vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Downloading Documentation",
			cancellable: true
		}, downloadPendingDocu_task)
	}

	async function downloadPendingDocu_task(progress, token) {
		progress.report({
			message: "Downloading Documentation"
		});

		var count_total = 0
		var count_current = 0
		for (const key of Object.getOwnPropertyNames(expression_tokens)) {
			if (token.isCancellationRequested) { break }
			if (expression_tokens[key]) {
				for (const element of expression_tokens[key]) {
					if (token.isCancellationRequested) { break }
					//token.onCancellationRequested(() => { return false })
					if (element.hasOwnProperty('docDownloadPending') && element['docDownloadPending']) {
						count_total += 1
					}
				}
			}
		}

		var enc = new TextEncoder();

		for (const key of Object.getOwnPropertyNames(expression_tokens)) {
			if (token.isCancellationRequested) { break }
			if (expression_tokens[key]) {
				for (const element of expression_tokens[key]) {
					if (token.isCancellationRequested) { break }

					try {
						if (element.hasOwnProperty('docDownloadPending') && element['docDownloadPending']) {
							count_current += 1
							progress.report({
								increment: 1 / count_total * 100
							})
							var data = await downloadFile(context, element['docDownloadPending'])

							if (data) {
								var pageContent = reg_getDocuContent.exec(data)
								if (pageContent && pageContent['groups'] && pageContent['groups']['content']) {
									var uri = vscode.Uri.joinPath(context.globalStorageUri, "docu/" + key.replace(/[/\\?%*:|"<>]/g, '-') + "/" + element['name'].replace(/[/\\?%*:|"<>]/g, '-') + '.html')
									await vscode.workspace.fs.writeFile(uri, enc.encode(pageContent['groups']['content'].replace(reg_removeComment, '')));
									element['documentationHTMLPath'] = UriToRelativeString(context.globalStorageUri, uri.toString())
									// pageContent[1].replace(reg_removeComment, '')
									element['docDownloadPending'] = null
								}
								count_current++
							}
						}
					} catch (error) {
						vscode.window.showErrorMessage("Could not update Documentation for " + element['name'])
					}

				}
			}
		}

		if (count_current > 0) {
			await save_expression_tokens(context)
			vscode.window.showInformationMessage("The Documentation has been updated.")
		}
	}

	/**
	 * @param {vscode.Uri} basepath
	 * @param {string} uri
	 */
	function UriToRelativeString(basepath, uri) {
		var uriString = uri.toString()
		var basePath = basepath.toString()
		if (uriString.startsWith(basePath)) {
			uriString = uriString.substring(basePath.length)
		}
		return uriString
	}
	/**
	 * @param {vscode.Uri} baseUri
	 * @param {string} [uriString]
	 */
	function UriFromRelativeString(baseUri, uriString) {
		if (uriString.startsWith('/')) {
			var baseString = baseUri.toString()
			var uri = vscode.Uri.parse(baseString + uriString)
		} else {
			var uri = vscode.Uri.parse(uriString)
		}
		return uri
	}

	/**
	 * @param {string} word
	 * @param {string} type
	 */
	async function findHoverToken(word, type) {
		var tokens = findTokensNormalized(word, type)
		if (!tokens || tokens.length == 0)
			return null

		var markdowns = []
		for (const token of tokens) {
			markdowns.push(await tokenToMarkdown(token))
		}
		return new vscode.Hover(markdowns);
	}
	/**
	 * @param {string} word
	 * @param {string} type
	 */
	function findTokensNormalized(word, type) {
		var name = word.toLowerCase().replace(reg_GCodeNormalize, '')
		var ret = []
		for (const element of expression_tokens[type]) {
			try {
				var name2 = element['name'].replace(reg_trimName, '').replace(reg_GCodeNormalize, '')
				name2 = name2.trim()
				if (name2.endsWith(')') || name2.endsWith(']')) {
					name2 = name2.substring(0, name2.length - 1)
				}
				if (name2.toLowerCase() == name) {
					ret.push(element)
				}
			} catch (error) {

			}
		}
		return ret
	}
	async function tokenToMarkdown(token) {
		if (token['documentationHTMLPath']) {
			var errorinUrlDownload = false
			try {
				var uri = UriFromRelativeString(context.globalStorageUri, token['documentationHTMLPath'])
				var dec = new TextDecoder("utf-8");
				var docu = dec.decode(await vscode.workspace.fs.readFile(uri))
			} catch (e) {
				var docu = 'Error while retrieving Documentation from Uri "' + uri.toString + "\n"
				if (e instanceof Error) {
					docu += e.message
				} else {
					docu += e.toString()
				}
				errorinUrlDownload = true
			}

			var hver = new vscode.MarkdownString(docu)
			hver.baseUri = vscode.Uri.parse(token['documentationBaseUrl'])
			if (!errorinUrlDownload) {
				hver.supportHtml = true
			}
			return hver

		} else if (token['documentationHTML']) {
			var hver = new vscode.MarkdownString(token['documentationHTML'])
			hver.baseUri = vscode.Uri.parse(token['documentationBaseUrl'])
			hver.supportHtml = true
			return hver

		} else if (token['documentation']) {
			var hver = new vscode.MarkdownString(token['documentation'])
			hver.baseUri = vscode.Uri.parse(token['documentationBaseUrl'])
			return hver
		} else {
			var hver = new vscode.MarkdownString('###' + token['name'])
			return hver
		}
	}

	loadData(context)
		.finally(() => initFileSystemWatcher())
		.finally(() => updateTokensFromWorkspace())
		.finally(() => downloadPendingDocu())

	// registerCommand planetcnc-expression.update
	context.subscriptions.push(
		vscode.commands.registerCommand('planetcnc-expression.update',
			async function () {
				await updateDocumentation(false)
			}
		)
	);

	// registerCommand planetcnc-expression.updateforced
	context.subscriptions.push(
		vscode.commands.registerCommand('planetcnc-expression.updateforced',
			async function () {
				await updateDocumentation(true)
			}
		)
	);

	var updateRunning = false
	async function updateDocumentation(forced) {
		try {
			if (updateRunning) {
				vscode.window.showWarningMessage('Update is already running. Wait for it to complete before starting another one.')
				return false
			}

			updateRunning = true

			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Searching for new Data",
				cancellable: true
			}, async (progress, token) => {
				var updated = await updateTokens(forced, progress, token)

				if (updated > 0) {
					await save_expression_tokens(context);
					vscode.window.showInformationMessage("New data has been downloaded")
				} else {
					vscode.window.showInformationMessage("You are using the most recend definitions")
				}

				progress.report({ increment: 100 })
			})

			await downloadPendingDocu()

		} catch (error) {

		} finally {
			updateRunning = false
		}
	}

	// CompletionItemProvider planetcncexpr
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{
				language: "planetcncexpr",
				scheme: "file"
			},
			{
				// eslint-disable-next-line no-unused-vars
				async provideCompletionItems(document, position, token, context) {
					var range = document.getWordRangeAtPosition(position, reg_WordBoundary);
					var word = document.getText(range);

					if (!word) { return []; }
					var result = [];
					var wordlc = word.toLowerCase();

					var validTypes = {
						'operators': {
							'tokenKind': vscode.CompletionItemKind.Operator
						},
						'parameters': {
							'tokenKind': vscode.CompletionItemKind.Variable
						},
						'functions': {
							'tokenKind': vscode.CompletionItemKind.Function
						},
						'events': {
							'tokenKind': vscode.CompletionItemKind.Event
						}
					}

					for (const key of Object.keys(validTypes)) {
						if (expression_tokens[key]) {
							var sections = await findTokens(expression_tokens[key], wordlc, expression_tokens[key]['tokenKind']);
							for (const element of sections) {
								element.range = range;
								result.push(element);
							}
						}
					}

					return result;
				}
			},
			'_', '#', '[', '('

		));

	// CompletionItemProvider planetcncgcode
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{
				language: "planetcncgcode",
				scheme: "file"
			},
			{
				// eslint-disable-next-line no-unused-vars
				async provideCompletionItems(document, position, token, context) {
					var range = document.getWordRangeAtPosition(position, reg_WordBoundary_Gcode);
					var word = document.getText(range);
					if (!word) { return []; }

					var wordlc = word.toLowerCase();

					// Do not complete if previous char is < because this is supposed to only contain a string.
					if (range.start.character.valueOf() > 0) {
						var textBefore = document.getText(new vscode.Range(new vscode.Position(range.start.line, 0), range.start));
						if (reg_prefixString.test(textBefore)) {
							return [];
						}
					}

					var result = [];

					// O-Words
					var wordtrim = wordlc;
					var prepend = '';
					if (wordlc.startsWith("o")) {
						wordtrim = wordlc.substring(1);
						prepend = 'O';
					}
					var sections = await findTokens(expression_tokens['owords'], wordtrim, vscode.CompletionItemKind.Module);
					for (const element of sections) {
						// if (prepend) {
						// 	element.filterText = prepend + element.filterText;
						// }
						element.range = range
						result.push(element)
					}


					//G-Code 
					var sections = await findTokens(expression_tokens['gcodes'], wordlc, vscode.CompletionItemKind.Method);
					for (const element of sections) {
						element.range = range
						result.push(element)
					}
					//M-Code
					var sections = await findTokens(expression_tokens['mcodes'], wordlc, vscode.CompletionItemKind.Function);
					for (const element of sections) {
						element.range = range
						result.push(element)
					}

					//Macros
					var sections = await findTokens(expression_tokens['macros'], wordlc, vscode.CompletionItemKind.Function);
					for (const element of sections) {
						if (!(element.insertText instanceof vscode.SnippetString) && element.insertText.startsWith("o")) {
							element.range = range
							element.insertText = "G65 P" + element.insertText.substring(1)
							result.push(element)
						}
					}

					// Comments
					var wordtrim = wordlc;
					var prepend = ''
					if (wordlc.startsWith("(")) {
						wordtrim = wordlc.substring(1)
						prepend = '('
					}
					var sections = await findTokens(expression_tokens['comments'], wordtrim, vscode.CompletionItemKind.Property)
					for (const element of sections) {
						element.range = range
						element.filterText = prepend + element.filterText;
						result.push(element)
					}

					// Parameters
					prepend = '#<'
					var wordtrim = wordlc;
					if (wordlc.startsWith("#<")) {
						wordtrim = wordlc.substring(2)
						prepend = '#<'
					}
					if (wordlc.startsWith("|")) {
						wordtrim = wordlc.substring(1)
						prepend = '|'
					}
					var sections = await findTokens(expression_tokens['parameters'], wordtrim, vscode.CompletionItemKind.Variable, null, prepend, '>');
					for (const element of sections) {
						element.range = range;
						// element.insertText = prepend + element.insertText + '>'
						element.filterText = prepend + element.filterText + '>'
						result.push(element);
					}
					return result;
				}
			},
			null
		));

	// HoverProvider planetcncgcode
	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			{
				language: "planetcncgcode",
				scheme: "file"
			},
			{
				async provideHover(document, position, token) {

					var range = document.getWordRangeAtPosition(position, reg_WordBoundary_Gcode);
					var word = document.getText(range).trim();
					var textbefore = document.getText(
						new vscode.Range(
							new vscode.Position(range.start.line, 0), range.start)
					)

					if (word.startsWith(';')) {
						// Comment
						return new vscode.Hover('This is a comment.');

					} else if (word.startsWith('\'')) {
						// escaped string
						return new vscode.Hover('This is a string');

					} else if (word.startsWith('P') && textbefore.match(reg_prefix_G65)) {
						// Macro call function
						var wordmatch = word.match(new RegExp('(?:P)([0-9]+)\\b', 'i'));
						if (wordmatch) {
							var hover = await findHoverToken('o' + wordmatch[1], 'macros')
							if (hover) { return hover }
						}


					} else if (word.startsWith('#<_')) {
						// Global Parameter
						var wordtrim = word.replace(new RegExp('^#<|>$|\\|.*$', 'gm'), '');
						var hover = await findHoverToken(wordtrim, 'parameters')
						if (hover) { return hover }
						return new vscode.Hover('Custom global variable:  ' + wordtrim);

					} else if (word.startsWith('(')) {
						// Comment function
						var wordtrim = word.replace(new RegExp('[\\(|,]*', 'i'), '');
						var wordtrim = wordtrim.replace(new RegExp(',', 'i'), '');
						var hover = await findHoverToken(wordtrim, 'comments')
						if (hover) { return hover }

					} else if (word.startsWith('#<')) {
						// Local Parameter
						var wordtrim = word.replace(new RegExp('^#<|>$|\\|.*$', 'igm'), '');
						var hover = await findHoverToken(wordtrim, 'parameters')
						if (hover) { return hover }
						return new vscode.Hover('Custom local variable:  ' + word);

					} else if (reg_GCode.test(word)) {
						var wordtrim = word.replace(reg_GCodeNormalize, '');
						if (wordtrim.toLowerCase().startsWith('g')) {
							var hover = await findHoverToken(wordtrim, 'gcodes')
						} else {
							var hover = await findHoverToken(wordtrim, 'mcodes')
						}
						if (hover) { return hover }

					} else {
						var hover = await findHoverToken(wordtrim, 'functions')
						if (hover) { return hover }

						var hover = await findHoverToken(wordtrim, 'operators')
						if (hover) { return hover }

					}
				}
			}
		));

	// HoverProvider planetcncexpr
	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			{
				language: "planetcncexpr",
				scheme: "file"
			},
			{
				async provideHover(document, position, token) {
					var range = document.getWordRangeAtPosition(position, reg_WordBoundary);
					var word = document.getText(range);

					if (word.startsWith(';')) {
						//return new vscode.Hover('This is a comment.');

					} else if (word.startsWith('\'')) {
						//return new vscode.Hover('This is a string');

					} else if (word.startsWith('_')) {
						return findHoverToken(word, 'parameters')
						// var item = expression_tokens['parameters'].find(element => element['name'] == word)
						// if (item) {
						// 	return new vscode.Hover(item['name'] + ': ' + item['detail'] + ' -- ' + item['documentation']);
						// }

						//return new vscode.Hover('Custom Global Variable: ' + word);

					} else if (word.startsWith('#')) {
						return findHoverToken(word, 'events')
						// var item = expression_tokens['events'].find(element => element['name'] == word)
						// if (item) {
						// 	return new vscode.Hover(item['name'] + ': ' + item['detail'] + ' -- ' + item['documentation']);
						// }

					} else {
						var item = await findHoverToken(word, 'functions')
						if (item) {
							return item
						}

						item = await findHoverToken(word, 'operators')
						if (item) {
							return item
						}
					}
				}
			}
		));



	// // analyze the document and return semantic tokens
	// var tokenMatrixDefaults = {
	// 	"events": {
	// 		"type": "event",
	// 		"matchWord": '^\\s*(?<keyword>#\\w+\\b)\\s*$',
	// 		"typeMod": "static"
	// 	},
	// 	"functions": {
	// 		"type": "function",
	// 		"typeMod": "static"
	// 	},
	// 	"parameters": {
	// 		"type": "variable",
	// 		"typeMod": "declaration"
	// 	},
	// 	"operators": {
	// 		"type": "operator",
	// 		"typeMod": ""
	// 	},
	// 	"macros": {
	// 		"type": "macro",
	// 		"typeMod": "declaration"
	// 	},
	// 	"comments": {
	// 		"type": "comment",
	// 		"matchWord": ';.+$',
	// 		"typeMod": "documentation"
	// 	},
	// 	"string": {
	// 		"type": "string",
	// 		"matchWord": "'((?:'|[^'])*)'",
	// 		"typeMod": "static"
	// 	},
	// 	"gcodes": {
	// 		"type": "function",
	// 		"typeMod": "static"
	// 	},
	// 	"mcodes": {
	// 		"type": "type",
	// 		"typeMod": "declaration"
	// 	},
	// 	"owords": {
	// 		"type": "keyword",
	// 		"typeMod": "static"
	// 	},
	// 	"gcodeFunctions": {
	// 		"type": "function",
	// 		"typeMod": "declaration"
	// 	}
	// }
	// var tokenTypes = []
	// var tokenModifiers = ['declaration', 'documentation', 'readonly', 'static']
	// for (const value of Object.entries(tokenMatrixDefaults)) {
	// 	if (!tokenTypes.includes(value['type'])) {
	// 		tokenTypes.push(value['type'])
	// 	}
	// 	if (!tokenModifiers.includes(value['modifier'])) {
	// 		tokenModifiers.push(value['modifier'])
	// 	}
	// }
	// var legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers)


	// context.subscriptions.push(
	// 	vscode.languages.registerDocumentSemanticTokensProvider(
	// 		{
	// 			language: "planetcncexpr",
	// 			scheme: "file"
	// 		},
	// 		{
	// 			provideDocumentSemanticTokens(document, cancelToken) {
	// 				const tokensBuilder = new vscode.SemanticTokensBuilder(legend)

	// 				for (const token of Object.keys(tokenMatrixDefaults)) {
	// 					if (cancelToken.isCancellationRequested) { return; }

	// 					if (tokenMatrixDefaults[token]['matchWord']) {

	// 						const regEx = new RegExp(tokenMatrixDefaults[token]['matchWord'], "img")

	// 						for (let x = 0; x < document.lineCount; x++) {
	// 							if (cancelToken.isCancellationRequested) { return; }
	// 							const lineText = document.lineAt(x).text
	// 							let myArray;

	// 							while ((myArray = regEx.exec(lineText)) !== null) {
	// 								tokensBuilder.push(
	// 									new vscode.Range(
	// 										new vscode.Position(x, regEx.lastIndex),
	// 										new vscode.Position(x, regEx.lastIndex + myArray[0].length)),
	// 									tokenMatrixDefaults[token].type,
	// 									[tokenMatrixDefaults[token].typeMod]
	// 								);
	// 							}
	// 						}
	// 					}
	// 				}

	// 				var t = tokensBuilder.build()
	// 				return t
	// 			}
	// 		},
	// 		legend
	// 	)
	// )
}

async function deactivate() {
	watcher.dispose();
}
module.exports = {
	activate,
	deactivate
}