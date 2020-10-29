export interface StreamObject {
    type : unknown;
}

export interface PIDObject extends StreamObject {
    type : unknown;
    pid : number;

}

export interface TableObject extends PIDObject {
    tableID : string;
}

export interface ProgramAssociationTable extends TableObject {
    transportStreamID : number;
    versionNumber : number;
    currentNextIndicator : number;
    table : Record<string, number>;
}

export interface ElementaryStreamInfo extends StreamObject {
    type: 'ElementaryStreamInfo';
    streamType : string;
    elementaryPID: number;
    esInfo : any[];
}

export interface ProgramMapTable extends TableObject {
    programNumber : number;
    versionNumber : number;
    currentNextIndicator : number;
    pcrPid : number;
    programInfo : any[];
    programElements : Record<string, ElementaryStreamInfo>;
}

export interface PESPacket extends PIDObject {
    type : 'PESPacket';
    streamID : string;
    pesPacketLength: number;
    priority: boolean;
    dataAlignmentIndicator : boolean;
    copyright: boolean;
    originalOrCopy : boolean;
    ptsDtsIndicator : number;
    escrFlag : boolean;
    esRateFlag : boolean;
    dsmTrickModeFlag : boolean;
    additionalCopyInfoFlag : boolean;
    crcFlag : boolean;
    extensionFlag : boolean;
    pesHeaderLength : number;
    pts : number;
    payloads : Buffer[];
}

export function bufferGroup (g : number);
export function readTSPackets();
export function readPAT(filter : boolean);
export function readPMTs(filter : boolean);
export function readPESPackets(filter : boolean);
