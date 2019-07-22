/*
 * Created by J. Yun, SCH Univ. (yun@sch.ac.kr), 2019/3/1
 * - use PMS7003 dust sensor with 'serialport' Node.js module
 * - use tas_sample created by I.-Y. Ahn, KETI
*/

var net = require('net');
var util = require('util');
var fs = require('fs');
var xml2js = require('xml2js');
var wdt = require('./wdt');

var serialport = require('serialport');

var usecomport = '';
var usebaudrate = '';
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

                usecomport = conf.tas.comport;
                usebaudrate = conf.tas.baudrate;
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

// Send read bytes to PMS7003
function serial_upload_action() {
    if (tas_state == 'upload') {
        var buf = Buffer.from([
            0x42, 
            0x4d, 
            0xe2, 
            0x00, 
            0x00, 
            0x01, 
            0x71]);       
        myPort.write(buf);
    }
}

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
                                myPort.write(g_down_buf);
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
}

var myPort = null;

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
            tas_state = 'init_serial';
        }
    }
    else if (tas_state == 'init_serial') {
        
        // list serial ports:
        serialport.list(function (err, ports) {
            ports.forEach(function(port) {
            console.log(port.comName);
            });
        });

        myPort = new serialport(usecomport, {
            baudRate : parseInt(usebaudrate, 10),
        });

        myPort.on('open', showPortOpen);
        myPort.on('data', saveLastestData);
        myPort.on('close', showPortClose);
        myPort.on('error', showError);

        if (myPort) {
            console.log('tas init serial ok');
            tas_state = 'connect';

            // set PMS7003 mode to passvie
            console.log('Set PMS7003 to passive mode');
            var buf = Buffer.from([
                0x42, 
                0x4d, 
                0xe1, 
                0x00, 
                0x00, 
                0x01, 
                0x70]);
            myPort.write(buf);
        }
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

// wdt.set_wdt(require('shortid').generate(), 2, timer_upload_action);

// Every 3 seconds, check if the TAS is not working
wdt.set_wdt(require('shortid').generate(), 3, tas_watchdog);

// Every 5 seconds, send a request message to PMS7003
// Chagne the value (e.g., 5 -> 10), if you want to modify the update interval
wdt.set_wdt(require('shortid').generate(), 5, serial_upload_action);

var cur_c = '';
var pre_c = '';
var g_sink_buf = '';
var g_sink_ready = [];
var g_sink_buf_start = 0;
var g_sink_buf_index = 0;
var g_down_buf = '';

// 1-byte data received
var val = 0;

function showPortOpen() {
    console.log('port open. Data rate: ' + myPort.baudRate);
}

function saveLastestData(data) {
    var l = data.length;
    // console.log(data);
    // console.log(data.length);
    for (var i = 0; i < l; i++) {
        val = data.readUInt8(i);
        // console.log(val);

        if (g_sink_buf_start == 0) {
            if (val == 0x42) {
                count = 1;
                g_sink_buf_start = 1;
                g_sink_ready.push(val);
            }
        }
        else if (g_sink_buf_start == 1) {
            if (val == 0x4d) {
                count = 2;
                g_sink_buf_start = 2;
                g_sink_ready.push(val);
            }
        }
        else if (g_sink_buf_start == 2) {
            count++;
            g_sink_ready.push(val);

            if (count >= 32){
                // console.log(g_sink_ready);
                // for (var i = 0; i < 32; i++) {
                //     console.log(i + ": " + g_sink_ready[i]);
                // }

                // From PMS7003 data sheet:
                // byte 1, 2: start characters 0x42, 0x4d
                // byte 3, 4: frame length
                // byte 5, 6: pm1.0 concentration unit ug/m^3 (CF=1, standard particle)
                // byte 7, 8: pm2.5, pm10 concentration unit ug/m^3 (CF=1, standard particle)
                // byte 9, 10: pm10 concentration unit ug/m^3 (CF=1, standard particle)                        
                // byte 11, 12: pm1.0 concentration unit ug/m^3 (under atmospheric environment)
                // byte 13, 14: pm2.5 concentration unit ug/m^3 (under atmospheric environment)
                // byte 15, 16: pm10 concentration unit ug/m^3 (under atmospheric environment)
                // byte 17, 18: # of particles with diameter beyond 0.3 um in 0.1 L of air                        
                // byte 19, 20: # of particles with diameter beyond 0.5 um in 0.1 L of air
                // byte 21, 22: # of particles with diameter beyond 1.0 um in 0.1 L of air
                // byte 23, 24: # of particles with diameter beyond 2.5 um in 0.1 L of air
                // byte 25, 26: # of particles with diameter beyond 5.0 um in 0.1 L of air
                // byte 27, 28: # of particles with diameter beyond 10 um in 0.1 L of air
                // byte 29, 30: reserved
                // byte 31, 32: check code = Start character1 + Start character 2 + ... + data 13 Low 8 bits

                // calculate pm1.0, 2.5, 10 concentration units from byte 11/12, 13/14, 15/16
                var pm1_0 = (g_sink_ready[10] << 8) | g_sink_ready[11];
                var pm2_5 = (g_sink_ready[12] << 8) | g_sink_ready[13];
                var pm10 = (g_sink_ready[14] << 8) | g_sink_ready[15];
                console.log("PM1.0: " + pm1_0 + " PM2.5: " + pm2_5 + " PM10: " + pm10);
    
                if (tas_state == 'upload') {
                    for(var i = 0; i < upload_arr.length; i++) {
                        if (upload_arr[i].ctname == 'dust') {
                            var cin = {ctname: upload_arr[i].ctname, con: pm1_0.toString() + ',' + pm2_5.toString() + ',' + pm10.toString()};
                            console.log('SEND : ' + JSON.stringify(cin) + ' ---->');
                            upload_client.write(JSON.stringify(cin) + '<EOF>');
                            break;
                        }
                    }
                }

                g_sink_ready = [];
                count = 0;
                g_sink_buf_start = 0;
            }
        }
    }
}

function showPortClose() {
    console.log('port closed.');
}

function showError(error) {
    console.log('Serial port error: ' + error);
}