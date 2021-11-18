import { Uri, Position, CompletionItem, CompletionItemKind, Disposable,
    Location, TextDocument, TextDocumentChangeEvent,
    workspace } from "vscode";
import * as fs from "fs";
import * as path from "path";

/* Divert targets that are always valid. */
const PERMANENT_DIVERTS = [
    new CompletionItem("END", CompletionItemKind.Keyword),
    new CompletionItem("DONE", CompletionItemKind.Keyword),
    new CompletionItem("->", CompletionItemKind.Keyword)
]

class DivertTarget {
    constructor ( public readonly name : string | null) { }
    public line : number;
    public readonly parentFile : NodeMap;
    public toCompletionItem () : CompletionItem {
        return new CompletionItem(this.name, CompletionItemKind.Reference);
    }
}

class LabelNode extends DivertTarget {

    //@ts-ignore
    public get line () {
        return this._line + this.parentStitch.startLine;
    }

    //@ts-ignore
    public get parentFile () {
        return this.parentStitch.parentKnot.parentFile;
    }

    constructor (
        public readonly name : string,
        private readonly _line : number,
        public readonly parentStitch : StitchNode
    ) {
        super(name);
    }


}

class StitchNode extends DivertTarget {
    public readonly labels : LabelNode[]

    //@ts-ignore
    public get line () {
        return this.startLine;
    }

    public get startLine () {
        return this.parentKnot.startLine + this._relativeStart;
    }

    //@ts-ignore
    public get parentFile () {
        return this.parentKnot.parentFile;
    }

    public get endLine () {
        // On the last stich of the last knot in the file, we want the end line to actually be
        // the next line after the end of the file. This is why we track whether we're on the
        // last line or not when generating the map.
        return this.parentKnot.startLine + this._relativeEnd + (this.lastLine ? 1 : 0);
    }

    constructor (
        public readonly name : string,
        private readonly _relativeStart : number,
        private readonly _relativeEnd : number,
        public readonly parentKnot : KnotNode,
        textContent : string,
        private readonly lastLine : boolean = false
    ) {
        super(name);
        this.labels = textContent
            .split("\n")
            .map((line, index) => ({ found: line.match(/^\s*[-\*\+]\s*\((\w+)\)/), index }))
            .filter(({ found }) => found !== null)
            .map(({ found, index }) => new LabelNode(found[1], index, this));
    }
}

class KnotNode extends DivertTarget {

    public readonly stitches;

    //@ts-ignore
    public get line () {
        return this.startLine;
    }

    constructor (
        public readonly name : string | null,
        public readonly startLine : number,
        public readonly endLine : number,
        public readonly parentFile : NodeMap,
        textContent : string,
        private readonly isFunction : boolean = false,
        private readonly lastLine : boolean = false
    ) {
        super(name);
        const lines = textContent.split("\n");
        this.stitches = lines
            .reduce((
                {nodes, currentNode, lastStart, lastName}
                : { nodes: StitchNode[], currentNode: string[], lastStart : number, lastName : string | null }
                , line : string
                , index : number) => {
                    if (line.match(/^\s*={1}\s*(\w+)/)) {
                        // Found the start of a new stitch.
                        const newName = line.match(/^\s*={1}\s*(\w+)/)[1];
                        const node = new StitchNode(lastName, lastStart, index, this, currentNode.join("\n"));
                        nodes.push(node);
                        if (index === lines.length -1) {
                            // The new stitch is also the last line of the knot.
                            const node = new StitchNode(newName, index, index + 1, this, currentNode.join("\n"), this.lastLine);
                            nodes.push(node);
                        }
                        return { nodes, currentNode: [line], lastStart: index, lastName: newName };
                    }
                    if (index === lines.length - 1) {
                        // Found the last line.
                        const node = new StitchNode(lastName, lastStart, index + 1, this, currentNode.join("\n"), this.lastLine);
                        nodes.push(node);
                        return { nodes, currentNode: [line], lastStart: index, lastName: null };
                    }
                    currentNode.push(line);
                    return { nodes, currentNode, lastStart, lastName };
            }, { nodes: [], currentNode: [], lastStart: 0, lastName: null })
            .nodes;
    }

    public toCompletionItem () : CompletionItem {
        const itemKind = this.isFunction ? CompletionItemKind.Function : CompletionItemKind.Reference;
        return new CompletionItem(this.name, itemKind);
    }
}

export class NodeMap {

    public readonly knots : KnotNode[];
    public readonly includes : string[];
    public readonly diverts : string[];

    private constructor (public filePath : string, fileText : string) {
        const lines = fileText.split("\n");
        this.knots = lines
            .reduce((
                {nodes, currentNode, lastStart, lastName, isFunction}
                : { nodes: KnotNode[], currentNode: string[], lastStart : number, lastName : string | null, isFunction }
                , line : string
                , index : number) => {
                        const match = line.match(/^\s*===*?(\s*function)?\s*(\w+)/);
                        if (match) {
                            // Found the start of a new knot.
                            const newName = match[2];
                            const foundFunction = (!!match[1]);
                            const node = new KnotNode(lastName, lastStart, index, this, currentNode.join("\n"), isFunction);
                            nodes.push(node);
                            return { nodes, currentNode: [line], lastStart: index, lastName: newName, isFunction: foundFunction };
                        }
                        if (index === lines.length - 1) {
                            // Found the last line
                            const node = new KnotNode(lastName, lastStart, index + 1, this, currentNode.concat(line).join("\n"), false, true);
                            nodes.push(node);
                            return { nodes, currentNode: [line], lastStart: index, lastName: null, isFunction };
                        }
                        currentNode.push(line);
                        return { nodes, currentNode, lastStart, lastName, isFunction };
            }, { nodes: [], currentNode: [], lastStart: 0, lastName: null, isFunction: false })
            .nodes;
        this.includes = lines
            .filter(line => line.match(/^\s*INCLUDE\s+(\w+\.ink)/))
            .map(line => {
                const filename = line.match(/^\s*INCLUDE\s+(\w+\.ink)/)[1];
                const dirname = path.dirname(filePath);
                return path.normalize(dirname + path.sep +  filename);
            });
        this.diverts = lines
            .filter(line => line.match(/(->|<-) ?(\w+)/))
            .map(line => line.match(/(->|<-) ?(\w+)/)[2]);
    }

    public static from (filePath : string) : Promise<NodeMap> {
        return new Promise<string>((resolve, reject) => {
            fs.readFile(filePath, 'utf8', (err, data : string) => {
                if (err) return reject(err);
                return resolve(data);
            });
        })
        .catch((err) => console.log("Error opening file: ", err))
        .then((data) => new NodeMap(filePath, data ? data : ""));
    }

    public static fromDocument (document : TextDocument) : NodeMap {
        const { fsPath } = document.uri;
        return new NodeMap(fsPath, document.getText());
    }
}

const nodeMaps : { [key: string]: NodeMap; } = {};

export function generateMaps () : Thenable<void> {
    return workspace.findFiles("**/*.ink")
        .then(uris => {
            return Promise.all(uris.map(({fsPath}) => NodeMap.from(fsPath))).catch(err => console.log);
        })
        .then((maps : NodeMap[]) => {
            maps.forEach(map => nodeMaps[map.filePath] = map);
        });
}

function getIncludeScope (filePath : string, knownScope : string[] = []) : string[] {
    const fileMap = nodeMaps[filePath];
    if (!fileMap) return knownScope;
    if (knownScope.indexOf(filePath) === -1) knownScope.push(filePath);
    const newScope = fileMap.includes.filter(include => knownScope.indexOf(include) === -1);
    if (newScope.length < 1) return knownScope;
    newScope.forEach(newInclude => knownScope = getIncludeScope(newInclude, knownScope));
    return knownScope;
}

function stitchFor (filePath : string, line : number) : StitchNode | null {
    const nodemap = nodeMaps[filePath]
    if (!nodemap) return null;
    const knot = nodemap.knots.find(knot => knot.startLine <= line && knot.endLine > line);
    if (!knot) {
        console.log("Can't identify knot for line ", line);
        return null;
    }
    const stitch = knot.stitches.find(stitch => stitch.startLine <= line && stitch.endLine > line);
    if (!stitch) {
        console.log("Can't identify stitch for line ", line);
        return null;
    }
    return stitch;
}

/* Finds all -> diverts in scope and returns all the target names they're pointing to */
function getDivertsInScope (filePath : string, line : number) : string[] {
    if (nodeMaps[filePath]) {
        // De-dupe the results by dumping them into a new Set
        return Array.from(new Set(
            getIncludeScope(filePath)
                .map(path => nodeMaps[path].diverts)
                .reduce((a, b) => a.concat(b))
        ));
    }
    console.log(`Node map missing for file ${filePath}`);
    return [];
}

/* Finds all divert targets (knots, labels, etc.) in scope for a given line and file. */
function getDivertTargetsInScope (filePath: string, line : number) : DivertTarget[] {
    if (nodeMaps[filePath]) {
        let targets : DivertTarget[] = [];
        const scope = getIncludeScope(filePath);
        const knots = scope.map(path =>
                nodeMaps[path]
                .knots
            )
            .reduce((a, b) => a.concat(b));
        targets = targets.concat(knots);
        const currentStitch = stitchFor(filePath, line);
        if (currentStitch) {
            const stitches = currentStitch.parentKnot.stitches;
            const labels = currentStitch.labels;
            targets = targets.concat(stitches);
            targets = targets.concat(labels);
        } else {
            console.log("WARN: Couldn't find current stitch for line ", line);
        }
    
        return targets;
    }
    console.log(`Node map missing for file ${filePath}`);
    return [];
}

export function getDefinitionByNameAndScope (name: string, filePath : string, line : number) : Location {
    const divert = getDivertTargetsInScope(filePath, line)
        .find(target => target.name === name);
    return new Location(Uri.file(divert.parentFile.filePath), new Position(divert.line, 0));
}

/* Returns completion items for divert target names when typing a divert -> */
export function getDivertTargetCompletionItems (filePath : string, line : number) : CompletionItem[] {
    return getDivertTargetsInScope(filePath, line)
        .filter(target => target.name !== null)
        .map(target => target.toCompletionItem())
        .concat(PERMANENT_DIVERTS);
}

/* Returns completion items for as-yet-undeclared divert target names when typing a knot header == */
export function getDivertCompletionItems (filePath : string, line : number) : CompletionItem[] {
    const divertTargets = getDivertTargetsInScope(filePath, line);
    return getDivertsInScope(filePath, line)
        .filter(divert => !divertTargets.find(divertTarget => divertTarget.name === divert)) // Ignore diverts whose targets already exist
        .filter(divert => !PERMANENT_DIVERTS.find(permanentDivert => permanentDivert.label === divert)) // Ignore permanent diverts, e.g. END
        .map(target => new CompletionItem(target, CompletionItemKind.Reference));
}

export class NodeController {
    private _disposable : Disposable;

    constructor () {
        let subscriptions : Disposable[] = [];
        workspace.onDidChangeTextDocument(this._onEvent, this, subscriptions);

        this._disposable = Disposable.from(...subscriptions);
    }

    private _onEvent ({ contentChanges, document } : TextDocumentChangeEvent) {
        // Don't rebuild the entire file unless we have a new line or special character
        // suggesting the node map actually changed.
        if (!contentChanges.find(change => change.text.match(/[\n\*\+\(\)-=]/) !== null)) return;
        const { fsPath } = document.uri;
        nodeMaps[fsPath] = NodeMap.fromDocument(document);
    }

    public dispose () {
        this._disposable.dispose();
    }
}