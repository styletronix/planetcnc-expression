const vscode = require('vscode');
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

function downloadParameters(context, force) {
	return new Promise((resolve, reject) => {
		var https = require('https');
		var url = new URL(parametersUrl)
		https.get(url, function (res) {
			var body = '';
			res.on('data', function (chunk) {
				body += chunk;
			});
			res.on('end', function () {
				var ret = parseParameterHtml(body, context, force);
				resolve(ret);
			});
		}).on('error', function (e) {
			console.log("Got error: " + e.message);
			vscode.window.showErrorMessage('Searching online for new Parameters failed: ' + e.message);
			reject(e)
		});
	})
};
function downloadGcode(context, force) {
	return new Promise((resolve, reject) => {
		var https = require('https');
		var url = new URL(gcodeUrl)
		return https.get(url, function (res) {
			var body = '';
			res.on('data', function (chunk) {
				body += chunk;
			});
			res.on('end', function () {
				var ret = parseGCodeHtml(body, context, force);
				resolve(ret);
			});
		}).on('error', function (e) {
			console.log("Got error: " + e.message);
			vscode.window.showErrorMessage('Searching online for new GCodes failed: ' + e.message);
			reject(e)
		});
	});

};
function downloadMcode(context, force) {
	return new Promise((resolve, reject) => {
		var https = require('https');
		var url = new URL(mcodeUrl)
		return https.get(url, function (res) {
			var body = '';
			res.on('data', function (chunk) {
				body += chunk;
			});
			res.on('end', function () {
				var ret = parseMCodeHtml(body, context, force);
				resolve(ret);
			});
		}).on('error', function (e) {
			console.log("Got error: " + e.message);
			vscode.window.showErrorMessage('Searching online for new MCodes failed: ' + e.message);
			reject(e)
		});
	});
};
function downloadmacros(context, force) {
	return new Promise((resolve, reject) => {
		var https = require('https');
		var url = new URL(macrosUrl)
		return https.get(url, function (res) {
			var body = '';
			res.on('data', function (chunk) {
				body += chunk;
			});
			res.on('end', function () {
				var ret = parseMacrosHtml(body, context, force);
				resolve(ret);
			});
		}).on('error', function (e) {
			console.log("Got error: " + e.message);
			vscode.window.showErrorMessage('Searching online for new macros failed: ' + e.message);
			reject(e)
		});
	});
};
function parseMacrosHtml(data, context, force) {
	var regexp = new RegExp('href=\\"(?<url>.*?)\\"(?:.*?data-wiki-id=\\"gcode:(?:mcodes|gcodes|macros):(?:mcode|gcode|macro)-.*\\"\\>)(?<gcode>[G|M|o|0-9/.]+)\\s-\\s(?<detail>.*)</a>', 'gmi')
	var regexResult = [...data.matchAll(regexp)]
	var type = 'macros'
	var count = 0

	regexResult.forEach(element => {
		var found = false
		var tokenfound

		for (let X = 0; X < expression_tokens[type].length; X++) {
			const element2 = expression_tokens[type][X];
			if (element2['name'] == element['groups']['gcode'] + ' - ' + element['groups']['detail']) {
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
					"name": element['groups']['gcode'] + ' - ' + element['groups']['detail'],
				}
			}
			token["insertText"] = element['groups']['gcode']
			token["detail"] = element['groups']['detail']

			if (element['groups']['url']) {
				token['documentation'] = 'https://cnc.zone' + element['groups']['url']
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

		for (let X = 0; X < expression_tokens[type].length; X++) {
			const element2 = expression_tokens[type][X];
			if (element2['name'] == element['groups']['gcode'] + ' - ' + element['groups']['detail']) {
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
					"name": element['groups']['gcode'] + ' - ' + element['groups']['detail'],
				}
			}
			token["insertText"] = element['groups']['gcode']
			//token["label"] = element['groups']['gcode'] + ' - ' + element['groups']['detail']
			token["detail"] = element['groups']['detail']

			if (element['groups']['url']) {
				token['documentation'] = 'https://cnc.zone' + element['groups']['url']
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

		for (let X = 0; X < expression_tokens[type].length; X++) {
			const element2 = expression_tokens[type][X];
			if (element2['name'] == element['groups']['gcode'] + ' - ' + element['groups']['detail']) {
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
					 "name": element['groups']['gcode'] + ' - ' + element['groups']['detail'],
				}
			}
			token["insertText"] = element['groups']['gcode']
			//token["label"] = element['groups']['gcode'] + ' - ' + element['groups']['detail']
			token["detail"] = element['groups']['detail']

			if (element['groups']['url']) {
				token['documentation'] = 'https://cnc.zone' + element['groups']['url']
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
	var regexp = /(?:data-wiki-id=\"tng:parameters:param.*?\>)(_\w+)/gmi
	var regexResult = [...data.matchAll(regexp)]
	var type = 'parameters'
	var count = 0
	
	regexResult.forEach(element => {
		var found = false
		var tokenfound

		for (let X = 0; X < expression_tokens[type].length; X++) {
			const element2 = expression_tokens[type][X];
			if (element2['name'] == element[1]) {
				found = true
				tokenfound = element2
				return
			}
		}

		//TODO: force
		if (!found) {
			var token = {
				"name": element[1]
			}
			if (element[1].endsWith('_num')) {
				token['snippet'] = element[1] + '|' + '${1:number}'
				if (element[1].endsWith('_axis')) {
					token['snippet'] = element[1] + '|' + '${1:axisnumber}'
				} else {
					token['insertText'] = element[1]
				}

				expression_tokens[type].push(token)
				count++
			}
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
}
/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	const reg_WordBoundary = new RegExp("((?:_\\w+)|(?:#\\w+)|(?:\\w+)|(?:'[^']*')|(?:;[^\\n]*))");
	//const reg_WordBoundary_Gcode = new RegExp("((?:/<#\\w+/|/>)|(?:O/<\\w*/>?)|(?:o/<\\w+/>)|(?:/<#\\.+?#/>)|(?:\\w+)|(?:'[^']*')|(?:;[^\\n]*))");
	const reg_WordBoundary_Gcode = new RegExp('(\\(\\w*)|(#\\<_?\\w*\\|?>?)|(^\\s*O<)|(o\\<\\w+\\>)|(\\<#.+\\>?)|(\\b\\w+\\b)|(\'[^\']*\')|(;[^\\n]*)');
	const reg_GCode = new RegExp("\\b[G|M|g|m][0-9]+\\b");
	const reg_GCodeNormalize = new RegExp('(?<=^[GM])0+(?=[0-9])|\\s+[^0-9]*$', 'gism');
	const reg_prefixString = new RegExp('(?<!#)<|\'', 'imsg')

	loadData(context);

	context.subscriptions.push(
		vscode.commands.registerCommand('planetcnc-expression.update',
			async function () {
				vscode.window.showInformationMessage('Searching online for new Data');
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
					await save_expression_tokens(context );
				}
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
						if (prepend) {
							element.filterText = prepend + element.filterText;
						}
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
					var prepend = '';
					if (wordlc.startsWith("(")) {
						wordtrim = wordlc.substring(1)
						var prepend = '(';
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
					var sections = findTokens(expression_tokens['parameters'], wordtrim, vscode.CompletionItemKind.Variable);
					sections.forEach(element => {
						element.range = range;
						element.insertText = prepend + element.insertText + '>'
						element.filterText = prepend + element.filterText + '>'
						result.push(element);
					})

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
					var word = document.getText(range);
					// var textbefore = document.getText(
					// 	new vscode.Range(
					// 		new vscode.Position(range.start.line, 0), range.start))

					if (word.startsWith(';')) {
						return new vscode.Hover('This is a comment.');

					} else if (word.startsWith('\'')) {
						return new vscode.Hover('This is a string');

					} else if (word.startsWith('<#_')) {
						var wordtrim = word.replace(new RegExp('^<#|>$|\\|.*$', 'gm'), '');
						var item = expression_tokens['parameters'].find(element => element['name'] == wordtrim)
						if (item) {
							return new vscode.Hover('<#' + item['name'] + '>:\n ' + item['detail'] + ' -- ' + item['documentation']);
						}
						return new vscode.Hover('Custom global variable:  ' + word);

					} else if (word.startsWith('<#')) {
						var wordtrim = word.replace(new RegExp('^<#|>$|\\|.*$', 'igm'), '');
						var item = expression_tokens['parameters'].find(element => element['name'] == word)
						if (item) {
							return new vscode.Hover('<#' + item['name'] + '>:\n ' + item['detail'] + ' -- ' + item['documentation']);
						}
						return new vscode.Hover('Custom local variable:  ' + word);




					} else if (reg_GCode.test(word)) {
						var wordtrim = word.replace(reg_GCodeNormalize, '');
						var item = expression_tokens['gcodes'].find(element => element['name'].replace(reg_GCodeNormalize, '') == wordtrim)
						if (item) {
							return new vscode.Hover(wordtrim + ":\n\n" + item['detail'] + "\n\n" + item['documentation'].replaceAll("\n", "\n\n"));
						}

					} else {
						return new vscode.Hover('This could be a function, local variable, static number or operator: ' + word);
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

function save_expression_tokens(context) {
	var enc = new TextEncoder();
	var fileUri = vscode.Uri.joinPath(context.globalStorageUri, "expr_tokens.json");
	return vscode.workspace.fs.writeFile(fileUri, enc.encode(JSON.stringify(expression_tokens)));

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

function addToexpression_tokens(dataObject) {
	if (dataObject.hasOwnProperty('sections')) {
		dataObject["sections"].forEach(element => {
			if (!expression_tokens['sections'].some(el => el.name == element[1])) {
				expression_tokens["sections"].push(element);
			}
		});
	}

	if (dataObject.hasOwnProperty('functions')) {
		dataObject["functions"].forEach(element => {
			if (!expression_tokens['functions'].some(el => el.name == element[1])) {
				expression_tokens["functions"].push(element);
			}
		});
	}
	if (dataObject.hasOwnProperty('operators')) {
		dataObject["operators"].forEach(element => {
			if (!expression_tokens['operators'].some(el => el.name == element[1])) {
				expression_tokens["operators"].push(element);
			}
		});
	}
	if (dataObject.hasOwnProperty('parameters')) {
		dataObject["parameters"].forEach(element => {
			if (!expression_tokens['parameters'].some(el => el.name == element[1])) {
				expression_tokens["parameters"].push(element);
			}
		});
	}
	if (dataObject.hasOwnProperty('gcodes')) {
		dataObject["gcodes"].forEach(element => {
			if (!expression_tokens['gcodes'].some(el => el.name == element[1])) {
				expression_tokens["gcodes"].push(element);
			}
		});
	}
	if (dataObject.hasOwnProperty('mcodes')) {
		dataObject["mcodes"].forEach(element => {
			if (!expression_tokens['mcodes'].some(el => el.name == element[1])) {
				expression_tokens["mcodes"].push(element);
			}
		});
	}
	if (dataObject.hasOwnProperty('macros')) {
		dataObject["macros"].forEach(element => {
			if (!expression_tokens['macros'].some(el => el.name == element[1])) {
				expression_tokens["macros"].push(element);
			}
		});
	}
	if (dataObject.hasOwnProperty('comments')) {
		dataObject["comments"].forEach(element => {
			if (!expression_tokens['comments'].some(el => el.name == element[1])) {
				expression_tokens["comments"].push(element);
			}
		});
	}
	if (dataObject.hasOwnProperty('owords')) {
		dataObject["owords"].forEach(element => {
			if (!expression_tokens['owords'].some(el => el.name == element[1])) {
				expression_tokens["owords"].push(element);
			}
		});
	}
}
async function deactivate() {

}

function findTokens(list, token, kind, regToApply) {
	var result = [];
	var tokenLow = token.toLowerCase();
	if (regToApply) {
		tokenLow = tokenLow.replace(regToApply, '');
	}

	list.forEach(element => {
		try {
			if (!element.hasOwnProperty('name')) {
				return;
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
				item.filterText = element['name'];
				if (element['detail']) {
					item.detail = element['detail']
				}

				if (element['documentation']) {
					item.documentation = element['documentation']
				}

				if (element['snippet']) {
					item.insertText = new vscode.SnippetString(element['snippet']);
				} else if (element['insertText']) {
					item.insertText = element['insertText'];
				} else {
					item.insertText = element['name'] + "("
				}

				result.push(item);
			}
		} catch (error) {
			vscode.window.showErrorMessage(error.message);
		}
	})
	return result;
}

module.exports = {
	activate,
	deactivate
}
