"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;

//const vscode = require("vscode");

function activate(context) {
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
        // { language: 'json', scheme: 'file' },
        'json',
        {
            // eslint-disable-next-line no-unused-vars
            provideCompletionItems(document, position, token, context) {
                let myitem = (text) => {
                    let item = new vscode.CompletionItem(text, vscode.CompletionItemKind.Text);
                    item.range = new vscode.Range(position, position);
                    return item;
                }
                return [
                    myitem('howdy1'),
                    myitem('howdy2'),
                    myitem('howdy3'),
                ];
            }
        },
        '.' // trigger
    ));
}
exports.activate = activate;