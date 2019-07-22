/**
 * Created by J. Yun, SCH Univ. (yun@sch.ac.kr)
 * - use HC-SR04 ultrasonic sensor with 'pigpio' Node.js module
 * - use ultrasonic sensor example in the pigpio package
 * - use tas sample created by I.-Y. Ahn, KETI
 * - run as root (e.g., sudo node app) due to pigpio C library
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

const Gpio = require('pigpio').Gpio;

// The number of microseconds it takes sound to travel 1cm at 20 degrees celcius
const MICROSECDONDS_PER_CM = 1e6/34321;
 
const trigger = new Gpio(23, {mode: Gpio.OUTPUT});          // GPIO23: trigger pin
const echo = new Gpio(24, {mode: Gpio.INPUT, alert: true}); // GPIO24: echo pin

const range_max = 200;  // maximum range for detection
const range_min = 0;  // minimum range for detection

var dist_0 = 0;
var dist_1 = 0;
var ultrasonic_update = false;

trigger.digitalWrite(0);

const watchHCSR04 = () => {
    let startTick;

    echo.on('alert', (level, tick) => {
        if (level == 1) {
            startTick = tick;
        } else {
            const endTick = tick;
            const diff = (endTick >> 0) - (startTick >> 0); // Unsigned 32 bit arithmetic
            // console.log(diff / 2 / MICROSECDONDS_PER_CM);
            dist_1 = (diff / 2 / MICROSECDONDS_PER_CM).toFixed(2);
            if (dist_1 >= range_max || dist_1 <= range_min)
                dist_1 =  -1;
        }
    });
};

watchHCSR04();

// Trigger a distance measurement once per second
setInterval(() => {
    trigger.trigger(10, 1);

    // comment out the below if-else statement to update at every interval
    if (dist_1 == -1) {
        if (dist_0 != -1)       
            ultrasonic_update = true;
        else
            ultrasonic_update = false;          // consecutive measurement out of range
    }
    else {
        if (Math.abs(dist_1 - dist_0) > 5)      // difference is larger than 5 cm
            ultrasonic_update = true;
        else
            ultrasonic_update = false;          // no difference between consecutive measurments
    }

    if (ultrasonic_update) {
        if (tas_state=='upload') {
            for(var i = 0; i < upload_arr.length; i++) {
                if(upload_arr[i].id != "ultrasound") {
                    var cin = {ctname: upload_arr[i].ctname, con: dist_1};
                    console.log("SEND : " + JSON.stringify(cin) + ' ---->')
                    upload_client.write(JSON.stringify(cin) + '<EOF>');
                    break;
                }
            }
        }
        dist_0 = dist_1;
    }
}, 1000);
