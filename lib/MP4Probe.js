(function moduleExporter(name, closure) {
"use strict";

var entity = GLOBAL["WebModule"]["exports"](name, closure);

if (typeof module !== "undefined") {
    module["exports"] = entity;
}
return entity;

})("MP4Probe", function moduleClosure(global, WebModule, VERIFY /*, VERBOSE */) {
"use strict";

// --- technical terms / data structure --------------------
/*

- DiagnosticInformationObject: Object
    - timescale:            UINT32
    - duration:             UINT32
    - duration_time:        HHMMSSString - "00:00:00.000"
    - playback_rate:        Number - 1.0
    - tracks:               TrackArray
    - video: Object
        - width:            UINT32
        - height:           UINT32
        - volume:           Number, 0.0 - 1.0
        - track_ID:         UINT8
        - duration:         UINT32
        - duration_time:    HHMMSSString - "00:00:00.000"
        - timescale:        UINT32
        - codec:            String - "AVC", ""
        - chunkLength":     UINT16,
        - sampleLength":    UINT16,
    - audio: Object
        - width:            UINT32
        - height:           UINT32
        - volume:           Number, 0.0 - 1.0
        - track_ID:         UINT8
        - duration:         UINT32
        - duration_time:    HHMMSSString - "00:00:00.000"
        - timescale:        UINT32
        - codec:            String - "AAC", ""
        - chunkLength":     UINT16,
        - sampleLength":    UINT16,

 */

// --- dependency modules ----------------------------------
var Bit         = WebModule["Bit"];
var HexDump     = WebModule["HexDump"];
var MP4Parser   = WebModule["MP4Parser"];
var NALUnitType = WebModule["NALUnitType"];
// --- import / local extract functions --------------------
var _split8     = Bit["split8"];  // Bit.split8(u32:UINT32, bitPattern:UINT8Array|Uint8Array):UINT32Array
// --- define / local variables ----------------------------
// --- class / interfaces ----------------------------------
var MP4Probe = {
    "getDiagnostic":    MP4Probe_getDiagnostic,     // MP4Probe.diagnostic(tree:MP4BoxTreeObject):DiagnosticInformationObject
    "dumpSamples":      MP4Probe_dumpSamples,       // MP4Probe.dumpSamples(tree:MP4BoxTreeObject):void
    "dumpTree":         MP4Probe_dumpTree,          // MP4Probe.dumpTree(tree:MP4BoxTreeObject):void
    "repository":       "https://github.com/uupaa/MP4Probe.js",
};

// --- implements ------------------------------------------
function MP4Probe_getDiagnostic(tree) { // @arg MP4BoxTreeObject
                                        // @ret DiagnosticInformationObject
//{@dev
    if (VERIFY) {
        $valid($type(tree, "MP4BoxTreeObject"), MP4Probe_getDiagnostic, "tree");
    }
//}@dev

    var video = _getDefaultVideoInfo();
    var audio = _getDefaultAudioInfo();
    var mvhd  = _mvhd(tree);
    var trak  = _trak(tree);

    for (var i = 0, iz = trak.length; i < iz; ++i) {
        if ( _isVideoTrack(tree, i) ) { // track[i] is video track.
            _setVideoTrackInfo(tree, i, video);
        } else { // track[i] is audio track.
            _setAudioTrackInfo(tree, i, audio);
        }
    }
    return {
        "timescale":        mvhd["timescale"],
        "duration":         mvhd["duration"],
        "duration_time":    _toHHMMSSTime(mvhd["duration"] / mvhd["timescale"]),
        "playback_rate":    mvhd["rate"] / 0x10000, // 0x10000 >> 16 -> 1.0
        "tracks":           trak.length,
        "video":            video,
        "audio":            audio,
    };
}

function _setVideoTrackInfo(tree, trackIndex, video) {
    var stsd = _stbl(tree, trackIndex)["stsd"];
    var tkhd = _tkhd(tree, trackIndex);
    var mdhd = _mdhd(tree, trackIndex);
    var chunkLength = _getChunkLength(tree, trackIndex);

    video["codec"]          = "avc1" in stsd ? "AVC" : "UNKNOWN";
    video["track_ID"]       = tkhd["track_ID"]; // 1 or 2 (maybe 1)
    video["timescale"]      = mdhd["timescale"];
    video["duration"]       = mdhd["duration"];
    video["duration_time"]  = _toHHMMSSTime(mdhd["duration"] / mdhd["timescale"]);
    video["width"]          = tkhd["width"]  >>> 16;
    video["height"]         = tkhd["height"] >>> 16;
    video["chunkLength"]    = chunkLength;

    for (var i = 0, iz = chunkLength; i < iz; ++i) {
        video["sampleLength"] += _getSampleLength(tree, trackIndex, i);
    }
}

function _setAudioTrackInfo(tree, trackIndex, audio) {
    var stsd = _stbl(tree, trackIndex)["stsd"];
    var tkhd = _tkhd(tree, trackIndex);
    var mdhd = _mdhd(tree, trackIndex);
    var chunkLength = _getChunkLength(tree, trackIndex);

    audio["codec"]          = "mp4a" in stsd ? "AAC" : "UNKNOWN";
    audio["track_ID"]       = tkhd["track_ID"]; // 1 or 2 (maybe 1)
    audio["timescale"]      = mdhd["timescale"];
    audio["duration"]       = mdhd["duration"];
    audio["duration_time"]  = _toHHMMSSTime(mdhd["duration"] / mdhd["timescale"]);
    audio["width"]          = tkhd["width"]  >>> 16;
    audio["height"]         = tkhd["height"] >>> 16;
    audio["chunkLength"]    = chunkLength;

    for (var i = 0, iz = chunkLength; i < iz; ++i) {
        audio["sampleLength"] += _getSampleLength(tree, trackIndex, i);
    }
}

function MP4Probe_dumpSamples(tree) { // @arg MP4BoxTreeObject
    var nals = MP4Parser["parse_mdat"](tree["root"]["mdat"]["data"]);

    for (var i = 0, iz = nals.length; i < iz; ++i) {
        var nalUnitSize = nals[i][0] << 24 | nals[i][1] << 16 |
                          nals[i][2] << 8  | nals[i][3];
        var field = _split8(nals[i][4], [1, 2, 5]);
        var nal_unit_type = field[2];

        HexDump(nals[i], {
            "title": "MP4Parser_mdat_dump NALUnit[" + i + "], " +
                     NALUnitType[nal_unit_type] + ", NALUnitSize = " + nalUnitSize + " bytes",
            "rule": {
                "size": { "begin": 0, "end": 4, "bold": true }
            }
        });
    }
}

function MP4Probe_dumpTree(tree) { // @arg MP4BoxTreeObject
    console.info( JSON.stringify(tree, _dump_replacer, 2) );
}

function _dump_replacer(key, value) {
    // TypedArray more than 5 bytes to omit.
    if (value.BYTES_PER_ELEMENT && value.length >= 5) {
        return "[" + [value[0].toString(16),
                      value[1].toString(16),
                      value[2].toString(16),
                      value[3].toString(16)].join(",") + ", ...]";
    }
    // NumberArray more than 5 bytes to omit.
    if (Array.isArray(value) && typeof value[0] === "number" && value.length >= 5) {
        return "[" + [value[0].toString(16),
                      value[1].toString(16),
                      value[2].toString(16),
                      value[3].toString(16)].join(",") + ", ...]";
    }
    return value;
}

function _getDefaultVideoInfo() { // @ret Object - { video, audio, width, height, volume, duration, ... }
    return {
        "width":            0,
        "height":           0,
        "volume":           0,
        "track_ID":         0,
        "duration":         0,
        "duration_time":    "",
        "timescale":        0,
        "codec":            "",     // "AVC" or ""
        "chunkLength":      0,
        "sampleLength":     0,
    };
}

function _getDefaultAudioInfo() { // @ret Object - { video, audio, width, height, volume, duration, ... }
    return {
        "width":            0,
        "height":           0,
        "volume":           0.0,
        "track_ID":         0,
        "duration":         0,
        "duration_time":    "",
        "timescale":        0,
        "codec":            "",     // "AAC" or ""
        "chunkLength":      0,
        "sampleLength":     0,
    };
}

function _isVideoTrack(tree,         // @arg MP4BoxTreeObject
                       trackIndex) { // @arg UINT8
                                     // @ret Boolean
    var hdlr = _hdlr(tree, trackIndex);
    var tkhd = _tkhd(tree, trackIndex);

    if (hdlr["handler_type"] === 0x76696465) { // "vide"
        if (tkhd["width"] && tkhd["height"]) {
            return true; // is Video track
        }
    }
    return false; // is Audio track
}

function _mvhd(tree) {
    return tree["root"]["moov"]["mvhd"];
}

function _mdhd(tree, trackIndex) {
    return tree["root"]["moov"]["trak"][trackIndex]["mdia"]["mdhd"];
}

function _trak(tree) {
    return tree["root"]["moov"]["trak"];
}

function _tkhd(tree, trackIndex) {
    return tree["root"]["moov"]["trak"][trackIndex]["tkhd"];
}

function _hdlr(tree, trackIndex) {
    return tree["root"]["moov"]["trak"][trackIndex]["mdia"]["hdlr"];
}

function _stbl(tree, trackIndex) {
    return tree["root"]["moov"]["trak"][trackIndex]["mdia"]["minf"]["stbl"];
}

function _getChunkLength(tree, trackIndex) {
    return _stbl(tree, trackIndex)["stsc"]["entry_count"] || 0;
}

function _getSampleLength(tree, trackIndex, chunkIndex) {
    return _stbl(tree, trackIndex)["stsc"]["samples"][chunkIndex]["samples_per_chunk"] || 0;
}

function _toHHMMSSTime(num) { // @arg Number - 61.23
                              // @ret String - "00:01:01.230"

    var hour = 60 * 60, min  = 60;
    var hh = 0, mm = 0, ss = 0, ms = 0.0;

    hh   = (num / hour) | 0;
    num -= hh * hour;
    mm   = (num / min) | 0;
    num -= mm * min;
    ss   = num | 0;
    num -= ss;
    ms   = num;

    return ("00" + hh).slice(-2) + ":" +
           ("00" + mm).slice(-2) + ":" +
           ("00" + ss).slice(-2) + "." + ("" + ms.toFixed(3)).slice(2);
}

return MP4Probe; // return entity

});

