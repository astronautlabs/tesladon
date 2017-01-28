/* Copyright 2016 Streampunk Media Ltd.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

var fs = require('fs');
var H = require('highland');
var bufferGroup = require('../src/bufferGroup.js');
var readTSPacket = require('../src/readTSPackets.js');
var readPAT = require('../src/readPAT.js');
var readPMTs = require('../src/readPMTs.js');
var readPESPackets = require('../src/readPESPackets.js');

var ts = H(fs.createReadStream(process.argv[2]));
var remaining = null;
var prev = -1;
var prevCount = 0;
var pmtPids = [];
var pes = {};

ts
  .pipe(bufferGroup(188))
  .pipe(readTSPacket())
  .pipe(readPAT(true))
  .pipe(readPMTs(true))
  .pipe(readPESPackets(true))
  .filter(x => x.type === 'PESPacket' && x.pid === 4097)
  .each(x => H.log(x.payloads))
/* .flatMap(function (x) {
  if (x.pid === 0) {
    var patOffset = 1 + x.payload.readUInt8(0);
    var tableHeader = x.payload.readUInt16BE(patOffset + 1);
    var pat = {
      type : 'ProgramAssocationTable',
      pid : 0,
      pointerField : patOffset - 1,
      tableID : x.payload.readUInt8(patOffset),
      sectionSyntaxHeader : (tableHeader & 0X8000) !== 0,
      privateBit : (tableHeader & 0x4000) !== 0,
      sectionLength : tableHeader & 0x3ff,
      transportStreamIdentifier : x.payload.readUInt16BE(patOffset + 3),
      versionNumber : x.payload.readUInt8(patOffset + 5) & 0x3c / 2 | 0,
      currentNextIndicator : (x.payload.readUInt8(patOffset + 5) & 0x01) !== 0,
      sectionNumber : x.payload.readUInt8(patOffset + 6),
      lastSectionNumber : x.payload.readUInt8(patOffset + 7)
    };
    patOffset += 8;
    while (patOffset < pat.sectionLength + 4) {
      var programNum = x.payload.readUInt16BE(patOffset);
      var programMapPID = x.payload.readUInt16BE(patOffset + 2) & 0x1fff;
      if (!pat.table) pat.table = {};
      pat.table[programMapPID] = {
        programNum : programNum,
        programMapPID : programMapPID
      };
      patOffset += 4;
    }
    pat.CRC = x.payload.readUInt32BE(patOffset);
    return H([x, pat])
  } else {
    return H([x]);
  }
})
.flatMap(function (x) {
  if (x.type && x.type === 'ProgramAssocationTable') {
    pmtPids = Object.keys(x.table).map(function (y) { return +y; });
    return H([x]);
  }
  if (pmtPids.indexOf(x.pid) >= 0) {
    var pmtOffset = 1 + x.payload.readUInt8(0);
    var tableHeader = x.payload.readUInt16BE(pmtOffset + 1);
    var pmt = {
      type : 'ProgramMapTable',
      pid : x.pid,
      pointerField : pmtOffset - 1,
      tableID : x.payload.readUInt8(pmtOffset),
      sectionSyntaxHeader : (tableHeader & 0X8000) !== 0,
      privateBit : (tableHeader & 0x4000) !== 0,
      sectionLength : tableHeader & 0x3ff,
      programNum : x.payload.readUInt16BE(pmtOffset + 3),
      versionNumber : x.payload.readUInt8(pmtOffset + 5) & 0x3c / 2 | 0,
      currentNextIndicator : (x.payload.readUInt8(pmtOffset + 5) & 0x01) !== 0,
      sectionNumber : x.payload.readUInt8(pmtOffset + 6),
      lastSectionNumber : x.payload.readUInt8(pmtOffset + 7),
      pcrPid: x.payload.readUInt16BE(pmtOffset + 8) & 0x1fff,
      programInfoLength : x.payload.readUInt16BE(pmtOffset + 10) & 0x3ff
    };
    pmtOffset += 12;
    if (pmt.programInfoLength > 0) { // TODO skipping for now - need to process
      pmtOffst += pmt.programInfoLength;
    }
    while (pmtOffset < pmt.sectionLength - 4) {
      var streamType = x.payload.readUInt8(pmtOffset);
      var elementaryPid = x.payload.readUInt16BE(pmtOffset + 1) & 0x1fff;
      var esInfoLength = x.payload.readUInt16BE(pmtOffset + 3) & 0x3ff;
      if (!pmt.esStreamInfo) pmt.esStreamInfo = {};
      pmt.esStreamInfo[elementaryPid] = {
        streamType : streamType,
        elementaryPid : elementaryPid,
        esInfoLength : esInfoLength,
        esInfo : x.payload.slice(pmtOffset + 5, pmtOffset + 5 + esInfoLength)
      }; // TODO decode ES info
      pmtOffset += 5 + esInfoLength;
    }
    pmt.CRC = x.payload.readUInt32BE(pmtOffset);
    return H([x, pmt]);
  } else {
    return H([x]);
  }
}).flatMap(function (x) {
  if (x.type === 'TSPacket') {
    if (x.payloadUnitStartIndicator === true) {
      if (x.payload.readUIntBE(0, 3) !== 1) {
        console.error('Expected PES packet at payload start indicator.');
        return H([x]);
      }
      var pesOptional = x.payload.readUInt16BE(6);
      var pesPacket = {
        type : 'PESPacket',
        pid : x.pid,
        streamID : x.payload.readUInt8(3),
        pesPacketLength : x.payload.readUInt16BE(4),
        scramblingControl : (pesOptional & 0x3000) >>> 12,
        priority : (pesOptional & 0x0800) !== 0,
        dataAlignmentIndicator : (pesOptional & 0x0400) !== 0,
        copyright : (pesOptional & 0x0200) !== 0,
        originalOrCopy : (pesOptional & 0x0100) !== 0,
        ptsDtsIndicator : (pesOptional & 0x00c0) >> 6,
        escrFlag : (pesOptional & 0x0020) !== 0,
        esRateFlag : (pesOptional & 0x0010) !== 0,
        dsmTrickModeFlag : (pesOptional & 0x0008) !== 0,
        additionalCopyInfoFlag : (pesOptional & 0x0004) !== 0,
        crcFlag : (pesOptional & 0x0002) !== 0,
        extensionFlag : (pesOptional & 0x00001) !== 0,
        pesHeaderLength : x.payload.readUInt8(8)
      };
      switch (pesPacket.ptsDtsIndicator) {
        case 2:
          pesPacket.pts = decodeTimeStamp(x.payload, 9);
          break;
        case 3:
          pesPacket.pts = decodeTimeStamp(x.payload, 9);
          pesPacket.dts = decodeTimeStamp(x.payload, 14);
        default:
          break;
      }
      pesPacket.payload = x.payload.slice(9 + pesPacket.pesHeaderLength);
      // TODO decode PTS and DTS
      if (pes[x.pid]) {
        var finishedPacket = pes[x.pid];
        pes[x.pid] = pesPacket;
        return H([x, finishedPacket]);
      } else {
        pes[x.pid] = pesPacket;
        return H([x]);
      }
    } else {
      if (pes[x.pid]) {
        var extendingPacket = pes[x.pid];
        extendingPacket.payload = Buffer.concat([extendingPacket.payload,
          x.payload], extendingPacket.payload.length + x.payload.length);
        pes[x.pid] = extendingPacket;
      }
      return H([x]);
    }
  } else {
    return H([x]);
  }
})
.each(function (x) {
  //  if ([ 0, 4096, 256, 257].indexOf(x.pid) === -1)
  //     console.log(x);
  if (x.type === 'ProgramAssocationTable') console.log(x);
  if (x.type === 'PESPacket') console.log(x.pid, x.pts, x.dts, x.payload.length, x.payload.slice(-10));
});*/
