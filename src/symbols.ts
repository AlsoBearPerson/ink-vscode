import { CancellationToken, DocumentSymbol, DocumentSymbolProvider, Location, Position, ProviderResult, SymbolInformation, SymbolKind, TextDocument } from "vscode";
import { NodeMap } from "./nodemap";

export class InkDocumentSymbolProvider implements DocumentSymbolProvider {

	public provideDocumentSymbols (document: TextDocument, token: CancellationToken): ProviderResult<SymbolInformation[] | DocumentSymbol[]> {
		return NodeMap.fromDocument(document).knots
			.filter(knot => knot.name !== null)
			.map(knot => new SymbolInformation(
				knot.name,
				SymbolKind.Method,
				knot.name,
				new Location(document.uri, new Position(knot.line, 0))
			));
	}
}