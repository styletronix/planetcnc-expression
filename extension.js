const vscode = require('vscode');
var watcher


/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
	var expression_tokens = {
		"sections": [],
		"functions": [],
		"operators": [],
		"parameters": [],
		"gcodes": [],
		"mcodes": [],
		"comments": [],
		"owords": [],
		"macros": []
	};

	const fs = require('fs/promises');
	const parametersUrl = 'https://cnc.zone/tng/parameters/parameters';
	const gcodeUrl = 'https://cnc.zone/gcode/gcodes/gcodes';
	const mcodeUrl = 'https://cnc.zone/gcode/mcodes/mcodes';
	const macrosUrl = 'https://cnc.zone/gcode/macros/macros'
	const sections = [
		'sections',
		'functions',
		'operators',
		'parameters',
		'gcodes',
		'mcodes',
		'macros',
		'comments',
		'owords'
	]

	const reg_WordBoundary = new RegExp("((?:_\\w+)|(?:#\\w+)|(?:\\w+)|(?:'[^']*')|(?:;[^\\n]*))");
	//const reg_WordBoundary_Gcode = new RegExp("((?:/<#\\w+/|/>)|(?:O/<\\w*/>?)|(?:o/<\\w+/>)|(?:/<#\\.+?#/>)|(?:\\w+)|(?:'[^']*')|(?:;[^\\n]*))");
	//const reg_WordBoundary_Gcode = new RegExp('(\\(\\w*)|(#\\<_?\\w*\\|?>?)|(^\\s*O<)|(o\\<\\w+\\>)|(\\<#.+\\>?)|(\\b\\w+\\b)|(\'[^\']*\')|(;[^\\n]*)');
	const reg_WordBoundary_Gcode = new RegExp('(G[0-9]+\\.?[0-9]+)|([GM][0-9]+[^.])|(\\(.*,)|(;.*)|(#<\\w+(||>))|(o<\\w+>\\s*\\w+\\b)|(\\b\\w+\\b)', 'i')
	const reg_GCode = new RegExp("\\b[G|M|g|m][0-9]+\\b");
	const reg_GCodeNormalize = new RegExp('(?<=M)0*(?=[0-9]+)', 'i')
	const reg_prefixString = new RegExp('(?<!#)<|\'', 'imsg')
	const reg_fileTypeMCode = new RegExp('(?:scripts/)(?<mcode>M[0-9]+).gcode', 'i')
	const reg_fileTypeMacro = new RegExp('(?:scripts/)(?<macro>o[0-9]+).gcode', 'i')
	const reg_commentName = new RegExp('\\(name\\s*,\\s*\'?(?<name>.*?)\'?\\)', 'i')
	const reg_docFileArea = new RegExp(';[\\s\\S]*?(?:^([^;])|\\z)', 'im')
	const reg_scriptFileNameSplit = new RegExp('(?<base>.*\\/(?<profile>.*?))\\/(?<profilerelative>scripts\\/(?<filename>(?<id>[o|M][0-9]+).gcode))', 'mi')
	//const reg_getDocuContent = new RegExp('-- wikipage start -->[\\n|\\s]*(.*?)[\\n|\\s]*<!-- wikipage stop --', 'is')
	const reg_getDocuContent = new RegExp('(?<=<body>)(.*)*(?=<\\\/body)', 'is')
	const reg_removeComment = new RegExp('(<!--.*?-->)', 'isg');
	const reg_trimName = new RegExp('\s*-\s*.*', 'i');

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

	};
	function downloadParameters(context, force) {
		return new Promise((resolve, reject) => {
			downloadFile(context, parametersUrl)
				.then(dat=>{
					var ret = parseParameterHtml(dat, context, force);
					resolve(ret);
				})
				.catch(error => {
					reject(error)
				})
		})
	};
	function downloadGcode(context, force) {
		return new Promise((resolve, reject) => {
			downloadFile(context, gcodeUrl)
				.then(dat => {
					var ret = parseGCodeHtml(dat, context, force);
					resolve(ret);
				})
				.catch(error => {
					reject(error)
				})
		})
	};
	function downloadMcode(context, force) {
		return new Promise((resolve, reject) => {
			downloadFile(context, mcodeUrl)
				.then(dat => {
					var ret = parseMCodeHtml(dat, context, force);
					resolve(ret);
				})
				.catch(error => {
					reject(error)
				})
		})
	};
	function downloadmacros(context, force) {
		return new Promise((resolve, reject) => {
			downloadFile(context, macrosUrl)
				.then(dat => {
					var ret = parseMacrosHtml(dat, context, force);
					resolve(ret);
				})
				.catch(error => {
					reject(error)
				})
		})
	};
	function parseMacrosHtml(data, context, force) {
		var regexp = new RegExp('href=\\"(?<url>.*?)\\"(?:.*?data-wiki-id=\\"gcode:(?:mcodes|gcodes|macros):(?:mcode|gcode|macro)-.*\\"\\>)(?<gcode>[G|M|o|0-9/.]+)\\s-\\s(?<detail>.*)</a>', 'gmi')
		var regexResult = [...data.matchAll(regexp)]
		var type = 'macros'
		var count = 0

		regexResult.forEach(element => {
			var found = false
			var tokenfound
			var id = element['groups']['gcode'] + ' - ' + element['groups']['detail']

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
				token["insertText"] = element['groups']['gcode']
				token["detail"] = element['groups']['detail']
				token["label"] = element['groups']['gcode'] + ' - ' + element['groups']['detail']
				
				if (element['groups']['url']) {
					token['documentation'] = "[Documentation](" + 'https://cnc.zone' + element['groups']['url'] + ")"
					token["docDownloadPending"] = 'https://cnc.zone/_export/xhtml' + element['groups']['url']
					token["documentationUrl"] = 'https://cnc.zone' + element['groups']['url']
					token["documentationBaseUrl"] = 'https://cnc.zone/'
				}
				
				if (!found) {
					expression_tokens[type].push(token)
				}
				count++;
			}
		})

		vscode.window.showInformationMessage(count + ' new Macros imported');
		return count
	}
	function parseMCodeHtml(data, context, force) {
		var regexp = new RegExp('href=\\"(?<url>.*?)\\"(?:.*?data-wiki-id=\\"gcode:(?:mcodes|gcodes):(?:mcode|gcode)-.*\\"\\>)(?<gcode>[G|M|0-9/.]+)\\s-\\s(?<detail>.*)</a>', 'gmi')
		var regexResult = [...data.matchAll(regexp)]
		var type = 'mcodes'
		var count = 0

		regexResult.forEach(element => {
			var found = false
			var tokenfound
			var id = element['groups']['gcode'] + ' - ' + element['groups']['detail']

			for (let X = 0; X < expression_tokens[type].length; X++) {
				const element2 = expression_tokens[type][X];
				if (element2['name'] == id) {
					found = true
					tokenfound = element2
					return
				}
			}
			// expression_tokens[type].forEach(element2 => {
			// 	if (element2['name'] == element['groups']['gcode']) {
			// 		found = true;
			// 		return;
			// 	}
			// })

			if (force || !found) {
				var token
				if (found) {
					token = tokenfound
				} else {
					token = {
						"name": id
					}
				}
				token["insertText"] = element['groups']['gcode']
				token["detail"] = element['groups']['detail']

				if (element['groups']['url']) {
					token['documentation'] = "[Documentation](" + 'https://cnc.zone' + element['groups']['url'] + ")"
					token["docDownloadPending"] = 'https://cnc.zone/_export/xhtml' + element['groups']['url']
					token["documentationUrl"] = 'https://cnc.zone' + element['groups']['url']
					token["documentationBaseUrl"] = 'https://cnc.zone/'
				}

				if (!found) {
					expression_tokens[type].push(token)
				}
				count++;
			}
		})

		vscode.window.showInformationMessage(count + ' new MCodes imported');
		return count
	}
	function parseGCodeHtml(data, context, force) {
		var regexp = new RegExp('href=\\"(?<url>.*?)\\"(?:.*?data-wiki-id=\\"gcode:gcodes:gcode-.*\\"\\>)(?<gcode>[G|M|0-9/.]+)\\s-\\s(?<detail>.*)</a>', 'gmi')
		var regexResult = [...data.matchAll(regexp)]
		var type = 'gcodes'
		var count = 0

		regexResult.forEach(element => {
			var found = false
			var tokenfound
			var id = element['groups']['gcode'] + ' - ' + element['groups']['detail']

			for (let X = 0; X < expression_tokens[type].length; X++) {
				const element2 = expression_tokens[type][X];
				if (element2['name'] == id) {
					found = true
					tokenfound = element2
					return
				}
			}
			// expression_tokens[type].forEach(element2 => {
			// 	if (element2['name'] == element['groups']['gcode']) {
			// 		found = true;
			// 		return;
			// 	}
			// })

			if (force || !found) {
				var token
				if (found) {
					token = tokenfound
				} else {
					token = {
						"name": id
					}
				}
				token["insertText"] = element['groups']['gcode']
				token["detail"] = element['groups']['detail']

				if (element['groups']['url']) {
					token['documentation'] = "[Documentation](" + 'https://cnc.zone' + element['groups']['url'] + ")"
					token["docDownloadPending"] = 'https://cnc.zone/_export/xhtml' + element['groups']['url']
					token["documentationUrl"] = 'https://cnc.zone' + element['groups']['url']
					token["documentationBaseUrl"] = 'https://cnc.zone/'
				}

				if (!found) {
					expression_tokens[type].push(token)
				}
				count++;
			}
		})

		vscode.window.showInformationMessage(count + ' new GCodes imported');
		return count
	}
	function parseParameterHtml(data, context, force) {
		var regexp = new RegExp('(?:data-wiki-id=\\"tng:parameters:param.*?\\>)(_\\w+)', 'gmi')
		var regexResult = [...data.matchAll(regexp)]
		var type = 'parameters'
		var count = 0

		regexResult.forEach(element => {
			var found = false
			var tokenfound
			var id = element[1]

			for (let X = 0; X < expression_tokens[type].length; X++) {
				const element2 = expression_tokens[type][X];
				if (element2['name'] == id) {
					found = true
					tokenfound = element2
					return
				}
			}

			//TODO: force
			if (!found) {
				count++
				var token = {
					"name": id
				}
				expression_tokens[type].push(token)

				if (element[1].endsWith('_num')) {
					token['snippet'] = element[1] + '|' + '${1:number}'
				} else if(element[1].endsWith('_axis')) {
					token['snippet'] = element[1] + '|' + '${1:axisnumber}'
				} else {
					token['insertText'] = element[1]
				}

				//TODO:
				//if (element['groups']['url']) {
				// 	token['documentation'] = "[Documentation](" + 'https://cnc.zone' + element['groups']['url'] + ")"
				// }
			}
		})

		vscode.window.showInformationMessage(count + ' new Parameters imported');
		return count
	}

	async function loadData(context) {
		try {
			var cacheLoaded = await load_expression_tokens(context)
			if (!cacheLoaded) {
				var result = await fs.readFile(context.extensionPath + '\\syntaxes\\expr_tokens.json', 'utf8')
				addToexpression_tokens(JSON.parse(result));
			}
		} catch (error) {
			//TODO: Exception handling
		}

		//await updateTokensFromWorkspace()
	}

	function initFileSystemWatcher() {
		return new Promise(function (resolve, reject) {
			try {
				watcher = vscode.workspace.createFileSystemWatcher("{**/*.txt,**/*.gcode}");
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
		var fileUri = vscode.Uri.joinPath(context.globalStorageUri, "expr_tokens.json");

		var expressionsFiltered = {}
		for (const [key, value] of Object.entries(expression_tokens)) {
			expressionsFiltered[key] = []
			for (const item of value) {
				if (!item.hasOwnProperty['isFromFile']) {
					expressionsFiltered[key].push(item)
				}
			}
		}

		return vscode.workspace.fs.writeFile(fileUri, enc.encode(JSON.stringify(expressionsFiltered)));
	}

	async function load_expression_tokens(context) {
		var dec = new TextDecoder("utf-8");
		try {
			var fileUri = vscode.Uri.joinPath(context.globalStorageUri, "expr_tokens.json");
			await vscode.workspace.fs.stat(fileUri);
			var value = await vscode.workspace.fs.readFile(fileUri)
			var data = JSON.parse(dec.decode(value));
			addToexpression_tokens(data);
			return true
		} catch (e) {
			vscode.window.showInformationMessage('Could not load cache file.');
			return false
		}
	}

	function addToexpression_tokens(dataObject, force) {
		for (const section of sections) {
			if (dataObject.hasOwnProperty(section)) {
				for (const item of dataObject[section]) {
					for (var i = 0; i < expression_tokens[section].length; i++){
						var item2 = expression_tokens[section][i]
						
						if (item.hasOwnProperty('isFromFile')) {
							if (item2['isFromFile'] == item['isFromFile']) {
								if (force) {
									expression_tokens[section][i] = item
								}
								return
							}
						} else {
							if (item2['name'] == item['name']) {
								if (force) {
									expression_tokens[section][i] = item
								}
								return
							}
						}
					}
					expression_tokens[section].push(item);
				}
			}
		}
	}


	function findTokens(list, token, kind, regToApply, prefix, suffix) {
		var result = [];
		if (!prefix) { prefix = '' }
		if (!suffix) { suffix = '' }

		var tokenLow = token.toLowerCase();
		if (regToApply) {
			tokenLow = tokenLow.replace(regToApply, '');
		}

		list.forEach(element => {
			try {
				if (!element.hasOwnProperty('name')) {
					return;
				}
				if (vscode.window.activeTextEditor && element.hasOwnProperty('isFromFile')) {
					var elementmatch = element['isFromFile'].match(reg_scriptFileNameSplit)
					if (elementmatch) {
						if (!vscode.window.activeTextEditor.document.uri.path.startsWith(elementmatch.groups['base'])){
							return
						}
					}
				}
				var name = element['name'].toLowerCase();
				if (regToApply) {
					name = name.replace(regToApply, '');
				}
				if (token == '' || name.includes(tokenLow)) {
					var item
					if (element['label']) {
						item = new vscode.CompletionItem(element['label'], kind);
					} else {
						item = new vscode.CompletionItem(element['name'], kind);
					}

					item.filterText = element['name'] + element['detail'];
					if (element['detail']) {
						item.detail = element['detail']
					}

					if (element['documentationHTML']) {
						var doc = new vscode.MarkdownString(element['documentationHTML'])
						doc.supportHtml = true 
						if (element['documentationBaseUrl']) {
							doc.baseUri = vscode.Uri.parse(element['documentationBaseUrl'],false)
						}
						item.documentation = doc
					}else if (element['documentation']) {
						item.documentation = new vscode.MarkdownString( element['documentation'])
					}

					
					if (element['snippet']) {
						item.insertText = new vscode.SnippetString(prefix + element['snippet'] + suffix);
					} else if (element['insertText']) {
						item.insertText = prefix +  element['insertText'] + suffix;
					} else {
						item.insertText = new vscode.SnippetString(prefix + element['name'] + "($1)" + suffix)
					}

					result.push(item);
				}
			} catch (error) {
				vscode.window.showErrorMessage(error.message);
			}
		})
		return result;
	}

	function removeAnalyzedFile(uri) {
		var match = uri.path.match(reg_fileTypeMCode)
		if (match.groups['mcode']) {
			for (let x = 0; x < expression_tokens['mcode'].length; x++) {
				const element = expression_tokens['mcode'][x];
				if (element['isFromFile'] == uri.path) {
					delete expression_tokens['mcode'][x];
					break
				}
			}
		}

		return Promise.resolve();
	}

	async function analyzeFile(uri) {
		try {
			var match = uri.path.match(reg_fileTypeMCode)
			if (match && match.groups['mcode']) {
				var dec = new TextDecoder("utf-8");
				var txt = dec.decode(await vscode.workspace.fs.readFile(uri))
				var label = ''
				var doc = ''

				if (txt) {
					var nameArrayResult =txt.match( reg_commentName)

					if (nameArrayResult && nameArrayResult.length == 2) {
						label = nameArrayResult[1]
					}

					var docMatch = txt.match(reg_docFileArea)
					if (docMatch) {
						doc = docMatch[0].replace(';', "  \n")
					}
				}

				var item = {
					'name': match.groups['mcode'],
					'insertText': match.groups['mcode'],
					'label': match.groups['mcode'] + ' - ' + label,
					'detail': label,
					'isFromFile': uri.path
				}
				var scriptFileMatch = uri.path.match(reg_scriptFileNameSplit)
				if (scriptFileMatch) {
					item['documentation'] = doc + "[" + scriptFileMatch.groups['profilerelative'] + "](" + uri.toString() + ")"
				} else {
					item['documentation'] = doc + "[From File](" + uri.toString() + ")"
				}

				addToexpression_tokens(
					{
						"mcodes": [item]
					}
					, true)
			}

			var match = uri.path.match(reg_fileTypeMacro)
			if (match && match.groups['macro']) {
				var dec = new TextDecoder("utf-8");
				var txt = dec.decode(await vscode.workspace.fs.readFile(uri))
				var label = ''
				var doc = ''

				if (txt) {
					var nameArrayResult =txt.match( reg_commentName)

					if (nameArrayResult && nameArrayResult.length == 2) {
						label = nameArrayResult[1]
					}

					var docMatch = txt.match(reg_docFileArea)
					if (docMatch) {
						doc = docMatch[0].replace(';', "  \n")
					}

				}

				var item1 = {
					'name': match.groups['mcode'],
					'insertText': match.groups['mcode'],
					'label': match.groups['mcode'] + ' - ' + label,
					'detail': label,
					'isFromFile': uri.path
				}
				var scriptFileMatch = uri.path.match(reg_scriptFileNameSplit)
				if (scriptFileMatch) {
					item1['documentation'] = doc + "[" + scriptFileMatch.groups['profilerelative'] + "](" + uri.toString() + ")"
				} else {
					item1['documentation'] = doc + "[From File](" + uri.toString() + ")"
				}
				
				addToexpression_tokens(
					{
						"mcodes": [item1]
					}
					, true)
			}
		} catch (error) {
			vscode.window.showErrorMessage(error.message + ' on Analyzing file ' + uri.path)
		}
	
	}

	async function updateTokensFromWorkspace() {
		var files = await vscode.workspace.findFiles("{**/*.txt,**/*.gcode}")
		for (const file of files) {
			const contents = await analyzeFile(file)
			console.log(contents);
		}
	}

	async function downloadPendingDocu() {
		var changed=false
		for (const section of sections) {
			if (expression_tokens[section]) {
				for (const element of expression_tokens[section]) {
					try {
						if (element.hasOwnProperty('docDownloadPending') && element['docDownloadPending']) {
							var data = await downloadFile(context, element['docDownloadPending'])

							if (data) {
								var pageContent = reg_getDocuContent.exec(data)
								if (pageContent && pageContent[1] && pageContent[1].length > 0) {
									element['documentationHTML'] = pageContent[1].replace(reg_removeComment, '')
								 	element['docDownloadPending'] = null
								 }
								changed = true
							}
						}
					} catch (error) {
						//vscode.window.showErrorMessage("Could not update Documentation for " + element['name'] )
					}
					
				}
			}
		}

		if (changed) {
			await save_expression_tokens(context)
			vscode.window.showInformationMessage("The Documentation has been updated.")
		}
	}

	function findHoverToken(word,type) {
		var tokens = findTokensNormalized(word,type)
		if (!tokens || tokens.length == 0)
			return null
		
		var markdowns = []
		for (const token of tokens) {
			markdowns.push(tokenToMarkdown(token))
		}
		return new vscode.Hover(markdowns);
}
	function findTokensNormalized(word, type) {
		var name = word.toLowerCase().replace(reg_GCodeNormalize,'')
		var ret = []
		for (const element of expression_tokens[type]) {
			try {
				var name2 = element['name'].replace(reg_trimName, '').replace(reg_GCodeNormalize, '')
				name2=name2.trim()
				if (name2.toLowerCase() == name) {
					ret.push(element)
				}
			} catch (error) {
				
			}
		}
		return ret
	}
	function tokenToMarkdown(token) {
		if (token['documentationHTML']) {
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

	context.subscriptions.push(
		vscode.commands.registerCommand('planetcnc-expression.update',
			async function () {
				vscode.window.showInformationMessage('Searching for new Data');
				var changed = false;
				var paramResult = await downloadParameters(context);
				if (paramResult > 0) {
					changed = true;
				}
				var gCodeResult = await downloadGcode(context)
				if (gCodeResult > 0) {
					changed = true;
				}

				var mCodeResult = await downloadMcode(context)
				if (mCodeResult > 0) {
					changed = true;
				}

				var macrosResult = await downloadmacros(context)
				if (macrosResult > 0) {
					changed = true;
				}

				if (changed) {
					await save_expression_tokens(context);
				}

				await downloadPendingDocu()
			}
		)
	);

	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{
				language: "planetcncexpr",
				scheme: "file"
			},
			{
				// eslint-disable-next-line no-unused-vars
				provideCompletionItems(document, position, token, context) {
					var range = document.getWordRangeAtPosition(position, reg_WordBoundary);
					var word = document.getText(range);

					if (!word) { return []; }
					var result = [];
					var wordlc = word.toLowerCase();

					var sections = findTokens(expression_tokens['sections'], wordlc, vscode.CompletionItemKind.Class);
					sections.forEach(element => {
						element.range = range;
						result.push(element);
					})

					var sections = findTokens(expression_tokens['functions'], wordlc, vscode.CompletionItemKind.Function);
					sections.forEach(element => {
						element.range = range;
						result.push(element);
					})

					var sections = findTokens(expression_tokens['operators'], wordlc, vscode.CompletionItemKind.Operator);
					sections.forEach(element => {
						element.range = range;
						result.push(element);
					})

					var sections = findTokens(expression_tokens['parameters'], wordlc, vscode.CompletionItemKind.Variable);
					sections.forEach(element => {
						element.range = range;
						result.push(element);
					})

					return result;
				}
			},
			null
		));

	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{
				language: "planetcncgcode",
				scheme: "file"
			},
			{
				// eslint-disable-next-line no-unused-vars
				provideCompletionItems(document, position, token, context) {
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
					var sections = findTokens(expression_tokens['owords'], wordtrim, vscode.CompletionItemKind.Module);
					sections.forEach(element => {
						// if (prepend) {
						// 	element.filterText = prepend + element.filterText;
						// }
						element.range = range
						result.push(element)
					})


					//G-Code 
					var sections = findTokens(expression_tokens['gcodes'], wordlc, vscode.CompletionItemKind.Method);
					sections.forEach(element => {
						element.range = range
						result.push(element)
					})
					//M-Code
					var sections = findTokens(expression_tokens['mcodes'], wordlc, vscode.CompletionItemKind.Function);
					sections.forEach(element => {
						element.range = range
						result.push(element)
					})

					//Macros
					var sections = findTokens(expression_tokens['macros'], wordlc, vscode.CompletionItemKind.Function);
					sections.forEach(element => {
						if (element.insertText.startsWith("o")) {
							element.range = range
							element.insertText = "G65 P" + element.insertText.substring(1)
							result.push(element)
						}
					})


					// Comments
					var wordtrim = wordlc;
					var prepend = ''
					if (wordlc.startsWith("(")) {
						wordtrim = wordlc.substring(1)
						prepend = '('
					}
					var sections = findTokens(expression_tokens['comments'], wordtrim, vscode.CompletionItemKind.Property)
					sections.forEach(element => {
						element.range = range
						element.filterText = prepend + element.filterText;
						result.push(element)
					})

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
					var sections = findTokens(expression_tokens['parameters'], wordtrim, vscode.CompletionItemKind.Variable, null, prepend, '>');
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

	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			{
				language: "planetcncgcode",
				scheme: "file"
			},
			{
				provideHover(document, position, token) {

					var range = document.getWordRangeAtPosition(position, reg_WordBoundary_Gcode);
					var word = document.getText(range).trim();
					// var textbefore = document.getText(
					// 	new vscode.Range(
					// 		new vscode.Position(range.start.line, 0), range.start))

					if (word.startsWith(';')) {
						// Comment
						return new vscode.Hover('This is a comment.');

					} else if (word.startsWith('\'')) {
						// escaped string
						return new vscode.Hover('This is a string');
						

					} else if (word.startsWith('<#_')) {
						// Global Parameter
						var wordtrim = word.replace(new RegExp('^<#|>$|\\|.*$', 'gm'), '');
						var hover = findHoverToken(wordtrim, 'parameters')
						if (hover){ return hover}
						return new vscode.Hover('Custom global variable:  ' + wordtrim);

					} else if (word.startsWith('(')) {
						// Comment function
						var wordtrim = word.replace(new RegExp('\(', 'i'), '');
						var hover = findHoverToken(wordtrim, 'comments')
						if (hover) { return hover }

					} else if (word.startsWith('<#')) {
						// Local Parameter
						var wordtrim = word.replace(new RegExp('^<#|>$|\\|.*$', 'igm'), '');
						var hover = findHoverToken(wordtrim,'parameters')
						if (hover) { return hover }
						return new vscode.Hover('Custom local variable:  ' + word);

					} else if (reg_GCode.test(word)) {
						var wordtrim = word.replace(reg_GCodeNormalize, '');
						if (wordtrim.toLowerCase().startsWith('g')){
							var hover = findHoverToken(wordtrim, 'gcodes')
						} else {
							var hover = findHoverToken(wordtrim, 'mcodes')
						}
						if (hover) { return hover }

					} else {
						var hover = findHoverToken(wordtrim, 'functions')
						if (hover) { return hover }

						var hover = findHoverToken(wordtrim, 'operators')
						if (hover) { return hover }

					}
				}
			}
		));

	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			{
				language: "planetcncexpr",
				scheme: "file"
			},
			{
				provideHover(document, position, token) {
					var range = document.getWordRangeAtPosition(position, reg_WordBoundary);
					var word = document.getText(range);

					if (word.startsWith(';')) {
						return new vscode.Hover('This is a comment.');

					} else if (word.startsWith('\'')) {
						return new vscode.Hover('This is a string');

					} else if (word.startsWith('_')) {
						var item = expression_tokens['parameters'].find(element => element['name'] == word)
						if (item) {
							return new vscode.Hover(item['name'] + ': ' + item['detail'] + ' -- ' + item['documentation']);
						}

						return new vscode.Hover('Custom Global Variable: ' + word);

					} else if (word.startsWith('#')) {
						var item = expression_tokens['sections'].find(element => element['name'] == word)
						if (item) {
							return new vscode.Hover(item['name'] + ': ' + item['detail'] + ' -- ' + item['documentation']);
						}

					} else {
						var item = expression_tokens['functions'].find(element => element['name'] == word)
						if (item) {
							return new vscode.Hover(item['name'] + ': ' + item['detail'] + ' -- ' + item['documentation']);
						}

						var item = expression_tokens['operators'].find(element => element['name'] == word)
						if (item) {
							return new vscode.Hover(item['name'] + ': ' + item['detail'] + ' -- ' + item['documentation']);
						}

						return new vscode.Hover('This could be a local variable or static number: ' + word);
					}
				}
			}
		));
}

async function deactivate() {
	watcher.dispose();
}
module.exports = {
	activate,
	deactivate
}
