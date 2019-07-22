/* TAS for RGB LED module (DFR0238)
 * Created by J. Yun, SCH Univ. (yun@sch.ac.kr)
 * Modify the tas_led sample developed by I.-Y. Ahn, KETI
*/
const Gpio = require('onoff').Gpio;
const pinRed = 17; // GPIO17 (pin11): red
const pinGreen = 18; // GPIO18 (pin12): green
const pinBlue = 27; // GPIO27 (pin13): blue

function turnOnRed() {
    const ledRed = new Gpio(pinRed, 'out');     
	console.log('Red light on!');
	ledRed.writeSync(1);
}

function turnOffRed() {
    const ledRed = new Gpio(pinRed, 'out');     
	console.log('Red light off!');
	ledRed.writeSync(0);
}

function turnOnGreen() {
    const ledGreen = new Gpio(pinGreen, 'out');   
	console.log('Green light on!');
	ledGreen.writeSync(1);
}

function turnOffGreen() {
    const ledGreen = new Gpio(pinGreen, 'out');   
	console.log('Green light off!');
	ledGreen.writeSync(0);
}

function turnOnBlue() {
    const ledBlue = new Gpio(pinBlue, 'out');    
	console.log('Blue light on!');
	ledBlue.writeSync(1);
}

function turnOffBlue() {
    const ledBlue = new Gpio(pinBlue, 'out');    
	console.log('Blue light off!');
	ledBlue.writeSync(0);
}

function turnOffAll() {
    const ledRed = new Gpio(pinRed, 'out');    
    const ledGreen = new Gpio(pinGreen, 'out');
    const ledBlue = new Gpio(pinBlue, 'out');

	console.log('All lights off!');
	ledRed.writeSync(0);
	ledGreen.writeSync(0);
	ledBlue.writeSync(0);
}

switch (process.argv[2]) {
    case '0':
        turnOffAll(); break;
    case '1':
        turnOnRed(); break;
    case '2':
        turnOffRed(); break;
    case '3':
        turnOnGreen(); break;
    case '4':
        turnOffGreen(); break;
    case '5':
        turnOnBlue(); break;
    case '6':
        turnOffBlue(); break;
    default:
        // console.log('Sorry, wrong command!');
}