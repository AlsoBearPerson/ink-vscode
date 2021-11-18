import { CompletionItemProvider, TextDocument, Position, CancellationToken, CompletionItem, Range, CompletionItemKind, workspace } from "vscode";
import * as NodeMap from "./nodemap";
import * as fs from "fs";

export class DivertCompletionProvider implements CompletionItemProvider {

    public provideCompletionItems (document: TextDocument, position: Position) : CompletionItem[] {
        const before = document.getText(new Range(position.with(position.line, 0), position));

        // Provide knot completion if we are at the end of a valid divert arrow.
        // Ignore a > at the start of a line.
        if (/(->|<-) ?$/.test(before) && !/-> ?-> ?$/.test(before))
        {
            return NodeMap.getDivertTargetCompletionItems(document.uri.fsPath, position.line);
        }

        // Provide divert target completion if we are at the end of a knot specifier.
        if (/^\s*===*?/.test(before))
        {
            return NodeMap.getDivertCompletionItems(document.uri.fsPath, position.line);
        }
    }

}