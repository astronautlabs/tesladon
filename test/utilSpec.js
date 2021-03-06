/* Copyright 2017 Streampunk Media Ltd.

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

const test = require('tape');
const tsUtil = require('../src/util.js');
const getRandomInt = require('./testUtil.js').getRandomInt;
const getRandomBoolean = require('./testUtil.js').getRandomBoolean;
const H = require('highland');

test('Timestamps roundtrip OK', t => {
  function checkStamp(stamp) {
    let b = Buffer.alloc(5);
    tsUtil.writeTimeStamp(stamp, 0, b, 0);
    t.equal(tsUtil.readTimeStamp(b, 0), stamp,
      `timestamps are equals for value 0x${stamp.toString(16)}.`);
  }
  for ( let x = 0 ; x < 100 ; x++ ) {
    checkStamp(getRandomInt(0, 0x1ffffffff));
  }
  // check bounds
  checkStamp(0);
  checkStamp(0x1ffffffff);
  t.throws(() => checkStamp(-1), /RangeError/,
    'negative value throws range error.');
  t.throws(() => checkStamp(0x200000000), /RangeError/,
    'over maximum throws range error.');
  t.throws(() => checkStamp('fred'), /TypeError/, 'timestamp must be a number, not a string.');
  t.throws(() => checkStamp(), /TypeError/, 'timestamp must not be undefined.');
  t.end();
});

test('TS time to PTP time roundtrips OK', t => {
  function checkStamp(tsTime, exp) {
    if (typeof exp === 'undefined') exp = tsTime;
    let ptpTime = tsUtil.tsTimeToPTPTime(tsTime);
    let tripTime = tsUtil.ptpTimeToTsTime(ptpTime);
    t.equal(tripTime, exp, `stamps ${ptpTime} and ${tsTime} are expected ${exp}.`);
  }
  for ( let x = 0 ; x < 100 ; x++ ) {
    checkStamp(getRandomInt(0, 0x1ffffffff));
  }
  // check bounds
  checkStamp(0);
  checkStamp(0x1ffffffff);
  // Timestamps wrap around
  checkStamp(-1, 0x1ffffffff);
  checkStamp(-2, 0x1fffffffe);
  checkStamp(0x200000000, 0);
  checkStamp(0x200000001, 1);
  t.throws(() => checkStamp('fred'), /TypeError/, 'timestamp must be a number, not a string.');
  t.throws(() => checkStamp(), /TypeError/, 'timestamp must not be undefined.');
  t.throws(() => tsUtil.ptpTimeToTsTime('fred'), 'ptp times must be arrays not strings.');
  t.throws(() => tsUtil.ptpTimeToTsTime(['wibble', 10]), 'ptp times must be arrays of numbers.');
  t.throws(() => tsUtil.ptpTimeToTsTime([10, 11, 12]), 'ptp times must be arrays of length 2.');
  t.end();
});

test('Table name ID mapping', t => {
  for ( let i = 0 ; i < 256 ; i++ ) {
    t.equal(tsUtil.tableNameID[tsUtil.tableIDName[i]], i,
      `for ${i}, table ID to name roundtrips via ${tsUtil.tableIDName[i]}.`);
  }
  t.end();
});

test('Stream type name ID mapping', t => {
  for ( let i = 0 ; i < 256 ; i++ ) {
    t.equal(tsUtil.streamTypeNameID[tsUtil.streamTypeIDName[i]], i,
      `for ${i}, stream type ID to name roundtrips via ${tsUtil.streamTypeIDName[i]}.`);
  }
  t.end();
});

test('Stream name ID mapping', t => {
  for ( let i = 0 ; i < 256 ; i++ ) {
    t.equal(tsUtil.streamNameID[tsUtil.streamIDName[i]], i,
      `for ${i}, stream ID to name roundtrips via ${tsUtil.streamIDName[i]}.`);
  }
  t.end();
});

test('MPEG CRC calculations are as expected', t => {
  let b = Buffer.from([0x00, 0xb0, 0x0d, 0xb3, 0xc8, 0xc1, 0x00, 0x00,
    0x00, 0x01, 0xe1, 0x00]);
  t.equal(tsUtil.crcMpeg(b), 0x5813bf6a, 'CRC and value from a file match.');
  t.equal(tsUtil.crcMpeg(Buffer.alloc(0)), 0xffffffff, 'empty buffer has CRC 0xffffffff.');
  b[7] = 42;
  t.notEqual(tsUtil.crcMpeg(b), 0x5813bf6a, 'change a byte and CRC changes.');
  t.throws(() => tsUtil.crcMpeg('wibble'), /TypeError/, 'CRC input must be a buffer.');
  t.throws(() => tsUtil.crcMpeg(), /TypeError/, 'CRC input must be defined.');
  t.end();
});

// CRC test values calculated based on http://www.sunshine2k.de/coding/javascript/crc/crc_js.html
const crcBasics = [
  0x4E08BFB4, 0x047679CA, 0x6CFF87B2, 0x6B6DC92A, 0xF923512A,
  0x9FE54C6D, 0xE298A691, 0x4ACADC12, 0xF7D85919, 0x6D6F4403 ];

test('Check basic CRC values', t => {
  for ( var size = 1; size <= 10 ; size++ ) {
    var b = Buffer.alloc(size);
    for ( let i = 0 ; i < b.length ; i++ ) b[i] = i;
    var crc = tsUtil.crcMpeg(b);
    t.ok(crc >= 0, `crc value 0x${crc.toString(16)} for buffer size ${b.length} is positive.`);
    t.equal(crc, crcBasics[size - 1], `crc value 0x${crc.toString(16)} matches external calculation.`);
  }
  t.end();
});

function makeTestPayload (length, pid = 42) {
  var tableID = getRandomBoolean() ? getRandomInt(0, 9) : getRandomInt(0x40, 0xfe);
  var testPayload = {
    type: 'TestPayload',
    pid: pid,
    tableID: tsUtil.tableIDName[tableID],
    sectionSyntaxIndicator: getRandomBoolean() ? 1 : 0,
    privateBit: getRandomBoolean() ? 1 : 0,
    tableIDExtension: getRandomInt(0, 0xffff),
    versionNumber: getRandomInt(0, 0x1f),
    currentNextIndicator: getRandomBoolean() ? 1 : 0,
    payloads: []
  };
  var maxSize = (testPayload.tableID.startsWith('user_private')) ? 4089 : 1017;
  maxSize -= (testPayload.sectionSyntaxIndicator === 1) ? 5 : 0;
  var data = Buffer.alloc(length);
  for ( let i = 0 ; i < data.length ; i++ ) {
    data[i] = i % 256;
  }
  var pos = 0;
  while (pos < length) {
    var nextPayload = data.slice(pos, pos + getRandomInt(0, maxSize));
    testPayload.payloads.push(nextPayload);
    pos += nextPayload.length;
  }
  return testPayload;
}

for ( let z = 0 ; z < 100 ; z++ ) {
  test('Distribute test payload into sections', t => {
    var pid = getRandomInt(0, 0x1fff);
    var tp = makeTestPayload(getRandomInt(0, 10000), pid);
    H([tp])
      .pipe(tsUtil.tableDistributor('Test', pid))
      // .doto(H.log)
      .doto(x => {
        t.equal(x.type, 'PSISections', 'object has expected type PSISections.');
        t.equal(x.pid, pid, `object has the correct PID of ${pid}.`);
        for ( let i in x.sections ) {
          let s = x.sections[i];
          t.equal(s.type, 'PSISection', `section ${i} has correct type PSISection.`);
          t.equal(s.pid, pid, `section ${i} has correct pid ${pid}.`);
          t.equal(s.pointerField, 0, `section ${i} has default pointer field of 0.`);
          t.equal(s.tableID, tp.tableID, `section ${i} has matching table ID.`);
          t.equal(s.sectionSyntaxIndicator, tp.sectionSyntaxIndicator,
            `section ${i} has matching section syntax indicator.`);
          t.equal(s.privateBit, tp.privateBit, `section ${i} has matching private bit.`);
          if (s.sectionSyntaxIndicator === 1) {
            t.equal(s.length, tp.payloads[i].length + 9, `section ${i} has expected length ${s.length}.`);
            t.equal(s.tableIDExtension, tp.tableIDExtension, `section ${i} has expected table ID extension.`);
            t.equal(s.versionNumber, tp.versionNumber, `section ${i} has expected version number.`);
            t.equal(s.currentNextIndicator, tp.currentNextIndicator,
              `section ${i} has expected current next indicator.`);
            t.equal(s.sectionNumber, +i, `section ${i} has expected section number.`);
            t.equal(s.lastSectionNumber, x.sections.length - 1,
              `section ${i} has expected last section number.`);
          } else { // No CRC when section syntax omitted
            t.equal(s.length, tp.payloads[i].length, `section ${i} has expected length ${s.length}.`);
          }
          if (+i === 0) {
            t.equal(s.payload[0], 0, `first bytes of section ${i} is 0 as expected.`);
          } else {
            if (s.payload.length > 0 && x.sections[+i - 1].payload.length > 0) {
              t.equal(s.payload[0], (x.sections[+i - 1].payload.slice(-1)[0] + 1) & 0xff,
                `section ${i} payload has bytes are contiguous with previous sections.`);
            }
          }
          if (s.CRC) {
            t.ok(s.CRC >= 0, `section ${i} CRC value is non-negative.`);
          }
        }
      })
      .errors(t.fail)
      .done(() => {
        t.end();
      });
  });
}

function sectionPayload (p) {
  if (p.payloadUnitStartIndicator) {
    let pointerFieldOffset = p.payload.readUInt8(0) + 1;
    let sectionSyntaxIndicator = (p.payload[pointerFieldOffset + 1] & 0x80) >>> 7;
    if (sectionSyntaxIndicator === 1) {
      return p.payload.slice(pointerFieldOffset + 8);
    } else {
      return p.payload.slice(pointerFieldOffset + 3);
    }
  } else {
    return p.payload;
  }
}

for ( let z = 0 ; z < 100 ; z++ ) {
  test('Convert sections into TS packets', t => {
    var pid = getRandomInt(0, 0x1fff);
    var tp = makeTestPayload(getRandomInt(0, 10000), pid);
    var sections = null;
    H([tp])
      .pipe(tsUtil.tableDistributor('Test', pid))
      .doto(secs => { sections = secs; })
      .pipe(tsUtil.sectionDistributor(pid))
      .errors(t.fail)
      .toArray(x => {
        if (x.length === 0) { return t.end(); } // payload length is zero - happens
        t.equal(x[0].payloadUnitStartIndicator, true,
          'first TS packet always the start of a section.');
        t.ok(x.every(y => y.pid === pid), 'every packet has the correct PID.');
        t.ok(x.every(y => y.transportErrorIndicator === false),
          'every packet has no transport errors flagged.');
        t.ok(x.every(y => y.transportPriority === false),
          'every packet has no transport priority set.');
        t.ok(x.every(y => y.scramblingControl === 0), 'every packet has no scrambling.');
        t.ok(x.every(y => y.adaptationFieldControl === 1),
          'every packet has payload and no adaptation field.');
        t.ok(x.every(y => y.payload.length === 184), 'every packet has a filled payload.');
        t.ok(x.every(y => y.payloadUnitStartIndicator ? y.payload[0] === 0 : true),
          'sections starts have zero pointer field.');
        t.ok(x.every(y => y.payloadUnitStartIndicator ? (y.payload[2] & 0x30) === 0x30 : true),
          'reserved length bits are set to 1.');
        var secLength = 0;
        var secCount = 0;
        for ( let i in x ) {
          var p = x[i];
          if (p.payloadUnitStartIndicator) {
            if (i === '0') {
              if (sectionPayload(p)[0] === 0xff) {
                t.ok(sectionPayload(p).every(z => z === 0xff),
                  'for payload length 0, no section syntax, every element of payload is 0xff.');
              } else if (sectionPayload(p)[4] === 0xff) { // empty section, 4 bytes of CRC with syntax header
                t.ok(sectionPayload(p).slice(4).every(z => z === 0xff),
                  'for payload length 0, with section syntax, every element of payload is 0xff after CRC.');
              } else {
                t.equal(sectionPayload(p)[0], 0,
                  'first element of first section payload entry is zero.');
              }
            } else {
              let lastTwo = sectionPayload(x[+i - 1]).slice(-2);
              var sliceOffset = sections.sections[secCount++].length - secLength -
                (sectionSyntaxIndicator === 1 ? 5 : 0);
              if (sliceOffset > 1) { // CRC not up against it
                // console.log('>>>', lastTwo);
                t.ok(
                  (lastTwo[1] === 0xff) ||
                  (((lastTwo[0] + 1) & 0xff) === lastTwo[1]),
                  `section ${secCount} ends with 0xff padding or is filled with sequence.`);
                t.ok(x[+i - 1].payload.slice(sliceOffset).every(y => y === 0xff),
                  'every value beyond end of section is padded with 0xff.');
              }
            }
            secLength = sectionPayload(p).length;
            var pointerFieldOffset = p.payload.readUInt8(0) + 1;
            var sectionSyntaxIndicator = (p.payload[pointerFieldOffset + 1] & 0x80) >>> 7;
          } else {
            secLength += sectionPayload(p).length;
            if (secLength - sections.sections[secCount].length < 175) { // CRC overlaps packets
              t.equal(
                sectionPayload(p)[0],
                (sectionPayload(x[+i - 1]).slice(-1)[0] + 1) & 0xff,
                `section payloads are incrementing into TS packet ${i}.`);
            }
          }
        }
        t.end();
      });
  });
}

for ( let z = 0 ; z < 100 ; z++ ) {
  test(`Roundtrip table ${z} to and from payloads`, t => {
    var pid = getRandomInt(0, 0x1fff);
    var tp = makeTestPayload(getRandomInt(0, 10000), pid);
    var sections = null;
    H([tp])
      .pipe(tsUtil.tableDistributor('Test', pid))
      .doto(secs => { sections = secs; })
      .pipe(tsUtil.sectionDistributor(pid))
      // .doto(H.log)
      .pipe(tsUtil.sectionCollector(pid))
      // .doto(H.log)
      .pipe(tsUtil.tableCollector(pid))
      .errors(t.fail)
      .toArray(x => {
        sections.sections = sections.sections.map(s => {
          delete s.headerBytes;
          return s;
        });
        for ( var i = 0 ; i < sections.sections.length ; i++ ) {
          // console.log('IN>>>', sections.sections[i]);
          if (x[0].sections[0].sectionSyntaxIndicator === 1) {
            // console.log('OUT>>', x[0].sections[i]);
            t.deepEqual(sections.sections[i], x[0].sections[i]);
          } else {
            // console.log('OUT>>', x[i].sections[0]);
            t.deepEqual(sections.sections[i], x[i].sections[0]);
          }
        }
        t.end();
      });
  });
}
