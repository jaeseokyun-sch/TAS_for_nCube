/**
 * Created by J. Yun, SCH Univ. (yun@sch.ac.kr)
 * - use ADXL345 accelerometer with 'i2c-bus' Node.js module
 * - use ADXL345 example (ADXL345.cpp) in Exploring RPi book by D. Molloy
 * - use tas_sample created by I.-Y. Ahn, KETI
 */

var net = require('net');
var util = require('util');
var fs = require('fs');
var xml2js = require('xml2js');

var wdt = require('./wdt');

var useparentport = '';
var useparenthostname = '';

var upload_arr = [];
var download_arr = [];

var conf = {};

// This is an async file read
fs.readFile('conf.xml', 'utf-8', function (err, data) {
    if (err) {
        console.log("FATAL An error occurred trying to read in the file: " + err);
        console.log("error : set to default for configuration")
    }
    else {
        var parser = new xml2js.Parser({explicitArray: false});
        parser.parseString(data, function (err, result) {
            if (err) {
                console.log("Parsing An error occurred trying to read in the file: " + err);
                console.log("error : set to default for configuration")
            }
            else {
                var jsonString = JSON.stringify(result);
                conf = JSON.parse(jsonString)['m2m:conf'];

                useparenthostname = conf.tas.parenthostname;
                useparentport = conf.tas.parentport;

                if (conf.upload != null) {
                    if (conf.upload['ctname'] != null) {
                        upload_arr[0] = conf.upload;
                    }
                    else {
                        upload_arr = conf.upload;
                    }
                }

                if (conf.download != null) {
                    if (conf.download['ctname'] != null) {
                        download_arr[0] = conf.download;
                    }
                    else {
                        download_arr = conf.download;
                    }
                }
            }
        });
    }
});

var tas_state = 'init';
var upload_client = null;
var t_count = 0;
var tas_download_count = 0;

function on_receive(data) {
    if (tas_state == 'connect' || tas_state == 'reconnect' || tas_state == 'upload') {
        var data_arr = data.toString().split('<EOF>');
        if (data_arr.length >= 2) {
            for (var i = 0; i < data_arr.length - 1; i++) {
                var line = data_arr[i];
                var sink_str = util.format('%s', line.toString());
                var sink_obj = JSON.parse(sink_str);

                if (sink_obj.ctname == null || sink_obj.con == null) {
                    console.log('Received: data format mismatch');
                }
                else {
                    if (sink_obj.con == 'hello') {
                        console.log('Received: ' + line);

                        if (++tas_download_count >= download_arr.length) {
                            tas_state = 'upload';
                        }
                    }
                    else {
                        for (var j = 0; j < upload_arr.length; j++) {
                            if (upload_arr[j].ctname == sink_obj.ctname) {
                                console.log('ACK : ' + line + ' <----');
                                break;
                            }
                        }

                        for (j = 0; j < download_arr.length; j++) {
                            if (download_arr[j].ctname == sink_obj.ctname) {
                                g_down_buf = JSON.stringify({id: download_arr[i].id, con: sink_obj.con});
                                console.log(g_down_buf + ' <----');
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
}

function tas_watchdog() {
    if (tas_state == 'init') {
        upload_client = new net.Socket();

        upload_client.on('data', on_receive);

        upload_client.on('error', function(err) {
            console.log(err);
            tas_state = 'reconnect';
        });

        upload_client.on('close', function() {
            console.log('Connection closed');
            upload_client.destroy();
            tas_state = 'reconnect';
        });

        if (upload_client) {
            console.log('tas init ok');
            tas_state = 'init_thing';
        }
    }
    else if (tas_state == 'init_thing') {
        // init things
        
        tas_state = 'connect';
    }
    else if (tas_state == 'connect' || tas_state == 'reconnect') {
        upload_client.connect(useparentport, useparenthostname, function() {
            console.log('upload Connected');
            tas_download_count = 0;
            for (var i = 0; i < download_arr.length; i++) {
                console.log('download Connected - ' + download_arr[i].ctname + ' hello');
                var cin = {ctname: download_arr[i].ctname, con: 'hello'};
                upload_client.write(JSON.stringify(cin) + '<EOF>');
            }

            if (tas_download_count >= download_arr.length) {
                tas_state = 'upload';
            }
        });
    }
}

// Every 3 seconds, check if the TAS is not working
wdt.set_wdt(require('shortid').generate(), 3, tas_watchdog);

// var rpio = require('rpio');
const i2c = require('i2c-bus');

// The ADXL345 Resisters required for this example
const DEVID = 0x00;
const POWER_CTL = 0x2D;
const DATA_FORMAT = 0x31;
const DATA_X0 = 0x32;
const DATA_X1 = 0x33;
const DATA_Y0 = 0x34;
const DATA_Y1 = 0x35;
const DATA_Z0 = 0x36;
const DATA_Z1 = 0x37;
const BUFFER_SIZE = 0x40;
const DEV_ADDR = 0x53;
var buf = new Buffer.alloc(BUFFER_SIZE);

// Trigger a acceleration measurement once per second
setInterval(() => {
    const i2c1 = i2c.openSync(1);   // open i2c1 bus
    
    i2c1.i2cWriteSync(DEV_ADDR, 2, Buffer.from([POWER_CTL, 0x08]));     // measurement mode  

    //Setting mode to 00000000=0x00 for +/-2g 10-bit
    //Setting mode to 00000001=0x01 for +/-4g 10-bit
    //Setting mode to 00000010=0x02 for +/-8g 10-bit
    //Setting mode to 00001011=0x0B for +/-16g 13-bit
    i2c1.i2cWriteSync(DEV_ADDR, 2, Buffer.from([DATA_FORMAT, 0x00]));   // +/-2g 10-bit
    
    i2c1.i2cWriteSync(DEV_ADDR, 2, Buffer.from([0x00, 0x00]));
    i2c1.i2cReadSync(DEV_ADDR, BUFFER_SIZE, buf);                       // read from ADXL345
      
    // console.log('The Device ID is: ' + buf[DEVID]);
    // console.log('The POWER_CTL mode is: ' + buf[POWER_CTL]);
    // console.log('The DATA_FORMAT is: ' + buf[DATA_FORMAT]);

    var x = Buffer.from([buf[DATA_X1], buf[DATA_X0]]);
    var y = Buffer.from([buf[DATA_Y1], buf[DATA_Y0]]);
    var z = Buffer.from([buf[DATA_Z1], buf[DATA_Z0]]);

    // combine two byte values for x, y, z axis each
    // +1 gravity = 255, -1 gravity = -255
    var accel  = x.readInt16BE(0) + ',' + y.readInt16BE(0) + ',' + z.readInt16BE(0);

    // console.log('Accel x, y, z: ' + accel);

    i2c1.closeSync();

    if (tas_state=='upload') {
        for(var i = 0; i < upload_arr.length; i++) {
            if(upload_arr[i].id != "accel") {
                var cin = {ctname: upload_arr[i].ctname, con: accel};
                console.log("SEND : " + JSON.stringify(cin) + ' ---->')
                upload_client.write(JSON.stringify(cin) + '<EOF>');
                break;
            }
        }
    }
}, 3000);
