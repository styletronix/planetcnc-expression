const vscode = require('vscode');
var expression_tokens = {
	"sections": [],
	"functions": [],
	"operators": [],
	"parameters": []
};

const fs = require('fs');
const parametersUrl = 'https://cnc.zone/tng/parameters/parameters';

function downloadParameters(context) {
	//var dest = extensionPath + '\\cache\\parameters.html'
	//var file = fs.createWriteStream(dest);
	var https = require('https');

	// var options = {
	// 	hostname: 'cnc.zone',
	// 	port: 443,
	// 	path: '/tng/parameters/parameters',
	// 	method: 'GET'
	// };

	var url = new URL(parametersUrl)
	https.get(url, function (res) {
		var body = '';
		res.on('data', function (chunk) {
			body += chunk;
		});
		res.on('end', function () {
			parseParameterHtml(body, context);
			vscode.window.showInformationMessage('Searching online for new Data completed');
		});
	}).on('error', function (e) {
		console.log("Got error: " + e.message);
		//throw e;
	});
};

function parseParameterHtml(data, context) {
	var regexp = /(?:data-wiki-id=\"tng:parameters:param.*?\>)(_\w+)/gmi;
	var regexResult = [...data.matchAll(regexp)];
	var changed = false;

	regexResult.forEach(element => {
		if (!expression_tokens['parameters'].some(el => el.name == element[1])) {
			expression_tokens['parameters'].push({
				"name": element[1],
				"insertText": element[1]
			});
			changed = true;
		}
	});

	 if (changed) {
		 write_expression_tokens(context);
	 }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	var reg_WordBoundary = new RegExp("((?:#\\w+)|(?:\\w+)|(?:'[^']*')|(?:;[^\\n]*))");
	var reg_GCode = new RegExp("\\b[G|M|g|m][0-9]+\\b");
	
	fs.readFile(context.extensionPath + '\\syntaxes\\expr_tokens.json', 'utf8',
		async function (err, data) {
			if (err) throw err;
			addToexpression_tokens(JSON.parse(data));
			await read_expression_tokens(context);
			downloadParameters(context);
		});

	context.subscriptions.push(
		vscode.commands.registerCommand('planetcnc-expression.update',
			function () {
				vscode.window.showInformationMessage('Searching online for new Data');
				downloadParameters();
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

					} else if (word.startsWith('#')) {
						var item = expression_tokens['sections'].find(element=> element['name'] == word)
						if (item) {
							return new vscode.Hover(item['name'] + ': ' + item['detail'] + ' -- ' + item['documentation']);
						}
					} else if (word.startsWith('\'')) {
						return new vscode.Hover('This is a string');

					} else if (word.startsWith('_')) {
						return new vscode.Hover('This is a global variable');

					} else if (reg_GCode.test(word)) {
						return new vscode.Hover('This is a G-Code: ' + word);


					} else {
						return new vscode.Hover('This could be a function, local variable, static number or operator: ' + word);
					}
				}
			}
		));
}

function write_expression_tokens(context) {
	var enc = new TextEncoder();
	var fileUri = vscode.Uri.joinPath( context.globalStorageUri, "expression_tokens.json");
	return vscode.workspace.fs.writeFile(fileUri, enc.encode(JSON.stringify(expression_tokens)));

} async function read_expression_tokens(context) {
	var dec = new TextDecoder("utf-8");
	try {
	var fileUri = vscode.Uri.joinPath(context.globalStorageUri, "expression_tokens.json");

	
		await vscode.workspace.fs.stat(fileUri);
		var value = await vscode.workspace.fs.readFile(fileUri)
		var data = JSON.parse(dec.decode(value));
		addToexpression_tokens(data);
	} catch (e) {
		vscode.window.showInformationMessage('Could not load cache file.');
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
}
async function deactivate() {

}

function findTokens(list, token, kind) {
	var result = [];
	var tokenLow = token.toLowerCase();
	list.forEach(element => {
		var name = element['name'].toLowerCase();
		if (name.includes(tokenLow)) {
			var item = new vscode.CompletionItem(element['name'], kind);

			if (element['detail']) {
				item.detail = element['detail']
			}

			if (element['documentation']) {
				item.documentation = element['documentation']
			}

			if (element['insertText']) {
				item.insertText = element['insertText']
			} else {
				item.insertText = element['name'] + "("
			}

			result.push(item);
		}
	});

	return result;
}



module.exports = {
	activate,
	deactivate
}
