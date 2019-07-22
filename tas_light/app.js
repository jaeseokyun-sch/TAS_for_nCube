/**
 * Created by J. Yun, SCH Univ. (yun@sch.ac.kr)
 * - use DFR0026 ambient light sensor with 'spi-device' Node.js module
 * - wire DFR0026 with channel 0 of MCP3008 analog-to-digital converter  
 * - use MCP3008 example in the spi-device package
 *   https://www.npmjs.com/package/spi-device
 * - use tas sample created by I.-Y. Ahn, KETI
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
const spi = require('spi-device');
var rawValue = 0;

// Trigger a light measurement once per second
setInterval(() => {
    const mcp3008 = spi.open(0, 0, (err) => {
        // An SPI message is an array of one or more read+write transfers
        const message = [{
            // sendBuffer: Buffer.from([0x01, 0x80, 0x00]), // Sent to read channel 0
            // sendBuffer: Buffer.from([0x01, 0x90, 0x00]), // Sent to read channel 1
            // sendBuffer: Buffer.from([0x01, 0xA0, 0x00]), // Sent to read channel 2
            // sendBuffer: Buffer.from([0x01, 0xB0, 0x00]), // Sent to read channel 3
            // sendBuffer: Buffer.from([0x01, 0xC0, 0x00]), // Sent to read channel 4
            // sendBuffer: Buffer.from([0x01, 0xD0, 0x00]), // Sent to read channel 5
            // sendBuffer: Buffer.from([0x01, 0xE0, 0x00]), // Sent to read channel 6
            // sendBuffer: Buffer.from([0x01, 0xF0, 0x00]), // Sent to read channel 7
            sendBuffer: Buffer.from([0x01, 0x80, 0x00]), // Sent to read channel 0
            receiveBuffer: Buffer.alloc(3),              // Raw data read from channel 5
            byteLength: 3,
            speedHz: 20000 // Use a low bus speed to get a good reading from the SPI devices
        }];
    
        if (err) throw err;
    
        mcp3008.transfer(message, (err, message) => {
            if (err) throw err;
    
            // Convert raw value from sensor to celcius and log to console
            rawValue = ((message[0].receiveBuffer[1] & 0x03) << 8) +
            message[0].receiveBuffer[2];
            const voltage = rawValue * 3.3 / 1023;
            // console.log(rawValue);
        });
    });
    
    if (tas_state=='upload') {
        for(var i = 0; i < upload_arr.length; i++) {
            if(upload_arr[i].id != "light") {
                var cin = {ctname: upload_arr[i].ctname, con: rawValue};
                console.log("SEND : " + JSON.stringify(cin) + ' ---->')
                upload_client.write(JSON.stringify(cin) + '<EOF>');
                break;
            }
        }
    }
}, 3000);
