﻿// For an introduction to the Blank template, see the following documentation:
// http://go.microsoft.com/fwlink/?LinkID=397705
// To debug code on page load in Ripple or on Android devices/emulators: launch your app, set breakpoints, 
// and then run "window.location.reload()" in the JavaScript Console.
module BlankCordovaApp1 {
    "use strict";

    export module Application {
        export function initialize() {
            document.addEventListener('deviceready', onDeviceReady, false);
        }

        function onDeviceReady() {
            // Handle the Cordova pause and resume events
            document.addEventListener('pause', onPause, false);
            document.addEventListener('resume', onResume, false);

            // TODO: Cordova has been loaded. Perform any initialization that requires Cordova here.
        
            console.warn("onDeviceReady");
        }

        function onPause() {
            // TODO: This application has been suspended. Save application state here.
            console.warn('onPause');
        }

        function onResume() {
            // TODO: This application has been reactivated. Restore application state here.
            console.warn('onResume');
        }
    }

    window.onload = function () {
        Application.initialize();
    }
}