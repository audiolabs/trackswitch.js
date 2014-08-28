// Put the audioContext in the global scope and pass it to each player instance.
// WebAudioAPI fallback for IE: http://stackoverflow.com/a/27711181
function audioContextCheck() {
    if (typeof AudioContext !== "undefined") {
        return new AudioContext();
    } else if (typeof webkitAudioContext !== "undefined") {
        return new webkitAudioContext();
    } else if (typeof mozAudioContext !== "undefined") {
        return new mozAudioContext();
    } else {
        return null;
    }
}
var audioContext = audioContextCheck();

if (typeof document.registerElement !== "undefined") {
    var TsTrack = document.registerElement('ts-track');
    var TsSource = document.registerElement('ts-source');
} 

var pluginName = 'trackSwitch',
    defaults = {
        mute: true,
        solo: true,
        globalsolo: true,
        repeat: false,
        radiosolo: false,
        onlyradiosolo: false,
        spacebar: false,
        tabview: false,
    };


function Plugin(element, options) {

    this.element = $(element);

    this.options = $.extend({}, defaults, options);

    if(!this.options.mute && !this.options.solo) {
        console.error("Cannot disable both solo and mute, reactivating solo");
        this.options.solo = true;
    }

    if(this.options.onlyradiosolo) {
        this.options.mute = false;
        this.options.radiosolo = true;
    }

    this._defaults = defaults;
    this._name = pluginName;

    // Properties for the overall player
    this.numberOfTracks = 0;
    this.longestDuration = 0;
    this.playing = false;
    this.repeat = this.options.repeat;
    this.startTime;
    this.position = 0;
    this.timerUpdateUI;
    this.currentlySeeking = false;
    this.seekingElement;

    // Properties and data for each track in coherent arrays
    this.trackProperties = Array();
    this.trackSources = Array();
    this.trackGainNode = Array();
    this.trackBuffer = Array();
    this.activeAudioSources = Array();

    // Skip gain node creation if WebAudioAPI could not load.
    if (audioContext) {
        // Master output gain node setup
        this.gainNodeMaster = audioContext.createGain();
        this.gainNodeMaster.gain.value = 0.0 // Start at 0.0 to allow fade in
        this.gainNodeMaster.connect(audioContext.destination);
    }

    this.init();
}


// Initialize Plugin
// Add markup for play controls
// Bind overlay click events
Plugin.prototype.init = function() {

    var that = this;

    // Add class for default CSS stylesheet
    this.element.addClass("jquery-trackswitch");

    if(this.element.find(".main-control").length === 0) {
        this.element.prepend(
            '<div class="overlay"><span class="activate">Activate</span>' +
                '<p id="overlaytext"></p>' +
                '<p id="overlayinfo">' +
                    '<span class="info">Info</span>' +
                    '<span class="text">' +
                        '<strong>trackswitch.js</strong> - open source multitrack audio player<br />' +
                        '<a href="https://github.com/audiolabs/trackswitch.js">https://github.com/audiolabs/trackswitch.js</a>' +
                    '</span>' +
                '</p>' +
            '</div>' +
            '<div class="main-control">' +
                '<ul class="control">' +
                    '<li class="playpause button">Play</li>' +
                    '<li class="stop button">Stop</li>' +
                    '<li class="repeat button">Repeat</li>' +
                    '<li class="timing">' +
                        '<span class="time">' +
                            '--:--:--:---' +
                        '</span>' +
                        ' / ' +
                        '<span class="length">' +
                            '--:--:--:---' +
                        '</span>' +
                    '</li>' +
                    '<li class="seekwrap">' +
                        '<div class="seekbar">' +
                            '<div class="seekhead"></div>' +
                        '</div>' +
                    '</li>' +
                '</ul>' +
            '</div>'
        );
    }

    // Remove the playhead in `.main-control` when there is one or more seekble images
    if (this.element.find('.seekable:not(.seekable-img-wrap > .seekable)').length > 0) {
        this.element.find('.main-control .seekwrap').hide();
    }

    // Wrap any seekable poster images in seekable markup
    this.element.find('.seekable:not(.seekable-img-wrap > .seekable)').each(function() {

        // Save a copy of the origial image src to reset image to
        that.originalImage = this.src;

        $(this).wrap( '<div class="seekable-img-wrap" style="' + $(this).data("style") + '; display: block;"></div>' );

        $(this).after(
            '<div class="seekwrap" style=" ' +
            'left: ' + ($(this).data("seekMarginLeft") || 0) + '%; ' +
            'right: ' + ($(this).data("seekMarginRight") || 0) + '%;">' +
                '<div class="seekhead"></div>' +
            '</div>'
        );

    });

    this.element.on('touchstart mousedown', '.overlay .activate', $.proxy(this.load, this));
    this.element.on('touchstart mousedown', '.overlay #overlayinfo .info', $.proxy(function() {
        this.element.find('.overlay .info').hide();
        this.element.find('.overlay .text').show();
    }, this));
    this.element.one('loaded', $.proxy(this.loaded, this));
    this.element.one('errored', $.proxy(this.errored, this));

    var tracklist = $('<ul class="track_list"></ul>');

    this.numberOfTracks = this.element.find('ts-track').length;

    if (this.numberOfTracks > 0) {

        this.element.find('ts-track').each(function(i) {

            that.trackProperties[i] = { mute: false, solo: false, success: false, error: false, };

            // Append classes to '.track' depending on options (for styling and click binding)
            var tabview = that.options.tabview ? " tabs" : ""; // For styling into tab view
            var radiosolo = that.options.radiosolo ? " radio" : ""; // For styling the (radio)solo button
            var wholesolo = that.options.onlyradiosolo ? " solo" : ""; // For making whole track clickable

            tracklist.append(
                // User defined style and title fallback if not defined
                '<li class="track' + tabview + wholesolo + '" style="' + ($(this).attr('style') || "") + '">' +
                    ($(this).attr('title') || "Track " + (i+1)) +
                    '<ul class="control">' +
                        (that.options.mute ? '<li class="mute button" title="Mute">Mute</li>' : '') +
                        (that.options.solo ? '<li class="solo button' + radiosolo + '" title="Solo">Solo</li>' : '') +
                    '</ul>' +
                '</li>'
            );

        });

        this.element.append(tracklist);

        // If radiosolo (or onlyradiosolo) selected, start with one track soloed
        if(this.options.radiosolo) {
            this.trackProperties[0].solo = true;
            this.apply_track_properties();
        }

        this.updateMainControls();

        // Throw a player error if the WebAudioAPI could not load.
        if (!audioContext) {
            this.element.trigger("errored");
            this.element.find("#overlaytext").html("Web Audio API is not supported in your browser. Please consider upgrading.");
            return false;
        }

    } else {

        this.element.trigger("errored");
        // With no text, as the player will be too small to show it anyway

    }

};


// Remove player elements etc
Plugin.prototype.destroy = function() {

    this.element.find(".main-control").remove();
    this.element.find(".tracks").remove();
    this.element.removeData();
};


// In case of source error, request next source if there is one, else fire a track error
Plugin.prototype.sourceFailed = function(currentTrack, currentSource, errorType) {

    // Request next source for this track if it exists, else throw error
    if (this.trackSources[currentTrack][currentSource+1] !== undefined) {
        this.prepareRequest(currentTrack, currentSource+1);
    } else {
        this.trackProperties[currentTrack].error = true;
        this.trackStatusChanged();
    }

}


// On sucessful audio file request, decode it into an audiobuffer
// Create and connect gain nodes for this track
Plugin.prototype.decodeAudio = function(request, currentTrack, currentSource) {

    var that = this;
    var audioData = request.response;

    // Looks like promise-based syntax (commented below) isn't supported on mobile yet...
    // audioContext.decodeAudioData(audioData).then(function(decodedData) {
    audioContext.decodeAudioData(audioData, function(decodedData) {

        that.trackGainNode[currentTrack] = audioContext.createGain();
        that.trackGainNode[currentTrack].connect(that.gainNodeMaster);
        that.trackBuffer[currentTrack] = audioContext.createBufferSource();
        that.trackBuffer[currentTrack].buffer = decodedData;

        // Fire a success if the decoding works and allow the player to proceed
        that.trackProperties[currentTrack].success = true;
        that.trackStatusChanged();

    }, function(e) {
        that.sourceFailed(currentTrack, currentSource, "Error Decoding File Type");
    });

}


// Make and listen to XMLHttpRequest for each source of a track as needed
Plugin.prototype.makeRequest = function(currentTrack, currentSource) {

    var that = this;

    var audioURL = $(this.trackSources[currentTrack][currentSource]).attr('src');
    var request = new XMLHttpRequest();
    request.open('GET', audioURL, true);
    request.responseType = 'arraybuffer';

    request.onreadystatechange = function() {

        if (request.readyState === 4) { // If request complete...
            if (request.status === 200) { // ...with status success
                that.decodeAudio(request, currentTrack, currentSource);
            } else { // ...with error
                that.sourceFailed(currentTrack, currentSource, "404 - File Not Found");
            }
        }

    }

    request.send();

}


// Check if there is a source to request for the given track
Plugin.prototype.prepareRequest = function(currentTrack, currentSource) {

    if (this.trackSources[currentTrack][currentSource] !== undefined) {
        this.makeRequest(currentTrack, currentSource)
    } else {
        this.sourceFailed(currentTrack, currentSource, "No Source Found");
    }

}


// On player load/activate, find the audio tracks and sources and filter out ones we can't play
// Then being the process of making requests for the files, starting with the first source of the first track
Plugin.prototype.load = function(event) {

    if (!this.valid_click(event)) { return true; } // If not valid click, break out of func

    event.preventDefault();

    var that = this;

    this.element.find(".overlay span.activate").addClass("fa-spin loading");

    if (this.numberOfTracks > 0) {

        var a = document.createElement('audio');

        var mimeTypeTable = {
            ".aac"  : "audio/aac;",
            ".aif"  : "audio/aiff;",
            ".aiff" : "audio/aiff;",
            ".au"   : "audio/basic;",
            ".mp1"  : "audio/mpeg;",
            ".mp2"  : "audio/mpeg;",
            ".mp3"  : "audio/mpeg;",
            ".mpg"  : "audio/mpeg;",
            ".mpeg" : "audio/mpeg;",
            ".m4a"  : "audio/mp4;",
            ".mp4"  : "audio/mp4;",
            ".oga"  : "audio/ogg;",
            ".ogg"  : "audio/ogg;",
            ".wav"  : "audio/wav;",
            ".webm" : "audio/webm;"
        }

        this.element.find('ts-track').each(function(i) {

            that.trackSources[i] = $(this).find('ts-source');

            // Check the mime type for each source of the current track
            for (var j=0; j<that.trackSources[i].length; j++) {

                // If a type has been defined by the user, use that
                if ('undefined' !== typeof $(that.trackSources[i][j]).attr('type')) {
                    var mime = $(that.trackSources[i][j]).attr('type') + ';';
                // else, compare the file extention to mime times of common audio formats.
                } else {
                    var ext = $(that.trackSources[i][j]).attr('src').substring($(that.trackSources[i][j]).attr('src').lastIndexOf("."));
                    console.log(ext);
                    var mime = mimeTypeTable[ext] !== undefined ? mimeTypeTable[ext] : "audio/"+ext.substr(1)+";";
                }

                // Beware of triple not!!! - If file type cannot be played...
                if ( !(!!(a.canPlayType && a.canPlayType(mime).replace(/no/, ''))) ) {
                    // ...eject it from the source list
                    that.trackSources[i].splice(j, 1)
                }
            }

        });

    }

    // Request the first source of all tracks at once
    for (var i=0; i<this.trackSources.length; i++) {
        this.prepareRequest(i,0);
    }

    event.stopPropagation();
    return false;

};


// As the audio file requests come back, save the longest audio file
// This lets us link all tracks time, timing calculations and onEnd to the longest
Plugin.prototype.findLongest = function() {

    for (var i=0; i<this.numberOfTracks; i++) {

        var currentDuration = this.trackBuffer[i].buffer.duration;

        if (currentDuration > this.longestDuration) {
            this.longestDuration = currentDuration
        }

    }

    this.element.trigger("loaded");

}


// When all tracks have been requested, proceed if possible, or in the event of errors, fire and show error
Plugin.prototype.trackStatusChanged = function() {

    var numOfRequests = 0, numOfErrors = 0;

    this.trackProperties.forEach(function(thisTrack) {
        numOfRequests += thisTrack.success || thisTrack.error ? 1 : 0;
        numOfErrors += thisTrack.error ? 1 : 0;
    });

    if (numOfRequests === this.numberOfTracks) {

        if (numOfErrors === 0) {
            this.findLongest(); // When `findLongest()` complete, 'loaded()' is called
        } else {
            this.element.trigger("errored");
            this.element.find("#overlaytext").html("One or more audio files failed to load.");
        }

    }

}


// When the audio files are completely (and sucessfully) loaded, unlock the player and set times
Plugin.prototype.loaded = function() {

    this.element.find(".overlay").removeClass("loading");
    this.element.find(".overlay").hide().remove();

    // Update the times based on the longest track
    $(this.element).find('.timing .time'  ).html('00:00:00:000');
    $(this.element).find('.timing .length').html(this.secondsToHHMMSSmmm(this.longestDuration));

    // Fire when loaded to reflect any changed made before activation (radiosolo)
    this.apply_track_properties();

    this.bindEvents();
};


// In the event of a player error, display error UI and unbind events
Plugin.prototype.errored = function() {

    this.element.find(".overlay span").removeClass("fa-spin loading");
    this.element.addClass("error");

    var that = this;
    this.trackProperties.forEach(function(thisTrack, i) {
        if (thisTrack.error) {
            $(that.element).find('.track_list > li:nth-child('+(i+1)+')').addClass("error");
        }
    });

    this.unbindEvents();
};


// Unbind all events previously bound
Plugin.prototype.unbindEvents = function() {

    this.element.off('touchstart mousedown', '.overlay span');
    this.element.off('loaded');

    this.element.off('touchstart mousedown', '.playpause');
    this.element.off('touchstart mousedown', '.stop');
    this.element.off('touchstart mousedown', '.repeat');

    this.element.off('mousedown touchstart', '.seekwrap');
    this.element.off('mousemove touchmove');
    this.element.off('mouseup touchend');

    this.element.off('touchstart mousedown', '.mute');
    this.element.off('touchstart mousedown', '.solo');

    if (this.options.spacebar) {
        $(window).unbind("keypress");
    }

};


// Bind events for player controls and seeking
Plugin.prototype.bindEvents = function() {

    this.element.on('touchstart mousedown', '.playpause', $.proxy(this.event_playpause, this));
    this.element.on('touchstart mousedown', '.stop', $.proxy(this.event_stop, this));
    this.element.on('touchstart mousedown', '.repeat', $.proxy(this.event_repeat, this));

    this.element.on('mousedown touchstart', '.seekwrap', $.proxy(this.event_seekStart, this));
    this.element.on('mousemove touchmove', $.proxy(this.event_seekMove, this));
    this.element.on('mouseup touchend', $.proxy(this.event_seekEnd, this));

    this.element.on('touchstart mousedown', '.mute', $.proxy(this.event_mute, this));
    this.element.on('touchstart mousedown', '.solo', $.proxy(this.event_solo, this));

    if (this.options.spacebar) {
        var that = this;

        $(window).unbind("keypress"); // Unbind other players before binding new

        $(window).keypress(function (event) {
            if (event.which === 32) { // Spacebar
                that.event_playpause(event); // Toggle playpause event
            }
        })
    }

};


// Event filter function to filter the `click` > 'touchstart mousedown' to left mouse and touch only
Plugin.prototype.valid_click = function(event) {

    if ( // Filter 'click' events for only touch or *left* click
        event.type === "touchstart" ||
        (event.type === "mousedown" && event.which === 1)
    ) {
        return true;
    } else {
        return false;
    }

}


// Format time for the UI, from seconds to HH:MM:SS:mmm
Plugin.prototype.secondsToHHMMSSmmm = function(seconds) {

    var h = parseInt( seconds / 3600 ) % 24;
    h = h < 10 ? '0'+h : h;

    var m = parseInt( seconds / 60 ) % 60;
    m = m < 10 ? '0'+m : m;

    var s = seconds % 60;
    s = s.toString().split(".")[0]; // Use only whole seconds (do not round)
    s = s < 10 ? '0'+s : s;

    var mil = Math.round((seconds % 1)*1000); // Decimal places to milliseconds
    mil = mil < 10 ? '00'+mil : mil < 100 ? '0'+mil : mil;

    return (h + ':' + m + ':' + s + ':' + mil);

}


// Update the UI elements for the position
Plugin.prototype.updateMainControls = function() {

    this.element.find(".playpause").toggleClass('checked', this.playing);
    this.element.find(".repeat").toggleClass('checked', this.repeat);

    var timePerc = ( this.position / this.longestDuration ) * 100;

    this.element.find('.seekhead').each(function() {
        $(this).css({left: timePerc+'%'});
    });

    if (this.longestDuration !== 0) { // Only update when player activated (add active flag?)
        $(this.element).find('.timing .time').html(this.secondsToHHMMSSmmm(this.position));
    }

}


// Timer fuction to update the UI periodically (with new time and seek position)
// Also listens for the longest track to end and stops or repeats as needed
Plugin.prototype.monitorPosition = function(context) {

    // context = this from outside the closure

    context.position = context.playing && !context.currentlySeeking ? audioContext.currentTime - context.startTime : context.position;

    // Can't use onEnded as context calls each time stopAudio is called...
    if (context.position >= context.longestDuration && !context.currentlySeeking) {

        context.position = 0;
        context.stopAudio();

        if (context.repeat) {
            context.startAudio(context.position);
        } else {
            context.playing = false;
        }

    }

    context.updateMainControls();

}


// Stop each track and destroy it's audio buffer and clear the timer
Plugin.prototype.stopAudio = function() {

    // Create downward master gain ramp to fade signal out
    var now = audioContext.currentTime;
    var downwardRamp = 0.03;

    // NOTE: The downward ramp is in 'free' time, after the playhead has stopped.
    // For this reason, making the ramps long to test with causes overlaps.
    this.gainNodeMaster.gain.cancelScheduledValues(now);
    this.gainNodeMaster.gain.setValueAtTime(1.0, now);
    this.gainNodeMaster.gain.linearRampToValueAtTime(0.0, now + downwardRamp);

    for (var i=0; i<this.numberOfTracks; i++) {
        this.activeAudioSources[i].stop(now + downwardRamp);
    }

    clearInterval(this.timerMonitorPosition);

}


// Create, connect and start a new audio buffer for each track and begin update timer
Plugin.prototype.startAudio = function(newPos, duration) {

    var that = this;

    // Ramping constants
    var now = audioContext.currentTime;
    var upwardRamp = downwardRamp = 0.03;

    this.position = typeof newPos !== 'undefined' ? newPos : this.position || 0;

    for (var i=0; i<this.numberOfTracks; i++) {

        this.activeAudioSources[i] = null; // Destroy old sources before creating new ones...

        this.activeAudioSources[i] = audioContext.createBufferSource();
        this.activeAudioSources[i].buffer = this.trackBuffer[i].buffer;
        this.activeAudioSources[i].connect(this.trackGainNode[i]);

        if (duration !== undefined) {

            // If a duration of track to play specificed (used in seeking)
            // Create upward master gain ramp to fade signal in (after the downwards ramp ends)
            this.gainNodeMaster.gain.setValueAtTime(0.0, now + downwardRamp);
            this.gainNodeMaster.gain.linearRampToValueAtTime(1.0, now + downwardRamp + upwardRamp);

            this.activeAudioSources[i].start(now + downwardRamp, this.position + downwardRamp, upwardRamp + duration);

            // Then schedule a downward ramp to fade out after playing for 'duration' of block
            this.gainNodeMaster.gain.setValueAtTime(1.0, now + downwardRamp + upwardRamp);
            this.gainNodeMaster.gain.linearRampToValueAtTime(0.0, now + downwardRamp + upwardRamp + duration);

        } else {

            // Create upward master gain ramp to fade signal in (regardless of the downward ramp)
            this.gainNodeMaster.gain.cancelScheduledValues(now);
            this.gainNodeMaster.gain.setValueAtTime(0.0, now);
            this.gainNodeMaster.gain.linearRampToValueAtTime(1.0, now + upwardRamp);

            this.activeAudioSources[i].start(now, this.position);

        }

    }

    this.startTime = now - ( this.position || 0 );

    this.timerMonitorPosition = setInterval(function(){
        that.monitorPosition(that);
    }, 16); // 62.5Hz for smooth motion

}


// Pause player (used by other players to enforce globalsolo)
Plugin.prototype.pause = function() {

    if (this.playing === true) {
        this.stopAudio();
        this.position = audioContext.currentTime - this.startTime;
        this.playing = false;
        this.updateMainControls();
    }

};


// Returns the other players on the page (for globalsolo)
Plugin.prototype.other_instances = function() {
    return $(".jquery-trackswitch").not(this.element);
};


// Iterate through the other players to pause them (for globalsolo)
Plugin.prototype.pause_others = function() {

    if (this.options.globalsolo) {
        this.other_instances().each(function () {
            $(this).data('plugin_' + pluginName).pause();
        });
    }

}


// Toggle start stop of audio, saving the position to mock pausing
Plugin.prototype.event_playpause = function(event) {

    if (!(this.valid_click(event) || event.which === 32)) { return true; } // If not valid click, break out of func

    event.preventDefault();

    if(!this.playing) {
        this.startAudio();
        this.pause_others();
        this.playing = true;
        this.updateMainControls();
    }
    else {
        this.pause();
    }

    event.stopPropagation();
    return false;

};


// Stop all audio tracks and set the position, seekheads etc to the start
Plugin.prototype.event_stop = function(event) {

    if (!this.valid_click(event)) { return true; } // If not valid click, break out of func

    event.preventDefault();

    var that = this;

    if (this.playing) {
        this.stopAudio();
    }

    this.position = 0;
    this.playing = false;

    this.updateMainControls();

    event.stopPropagation();
    return false;

};


// Toggle the repeat property and button UI
Plugin.prototype.event_repeat = function(event) {

    if (!this.valid_click(event)) { return true; } // If not valid click, break out of func

    event.preventDefault();

    this.repeat = !this.repeat;
    this.updateMainControls();

    event.stopPropagation();
    return false;

};


// When seeking, calculate the desired position in the audio from the position on the slider
Plugin.prototype.seek = function(event) {

    // Getting the position of the event is different for mouse and touch...
    if (event.type.indexOf("mouse") >= 0) {
        var posXRel = event.pageX - $(this.seekingElement).offset().left;
    } else {
        var posXRel = event.originalEvent.touches[0].pageX - $(this.seekingElement).offset().left;
    }

    // Limit the seeking to within the seekbar min/max
    var seekWidth = $(this.seekingElement).width();
    seekWidth = seekWidth < 1 ? 1 : seekWidth // Lower limit of width to 1 to avoid dividing by 0

    // Constrain posXRel to within the seekable object
    var posXRelLimted = posXRel < 0 ? 0 : posXRel > seekWidth ? seekWidth : posXRel;

    var timePerc = ( posXRelLimted / seekWidth ) * 100;

    var newPosTime = this.longestDuration * (timePerc/100);

    // Only perform the audio part of the seek function if mouse is within seekable area!
    if (posXRel >= 0 && posXRel <= seekWidth) {

        if (this.playing) {
            this.stopAudio();
            this.startAudio(newPosTime, 0.03);
        } else {
            this.position = newPosTime;
        }

    } else {
        // Always update the position and update UI to ensure it reads extremes of seek
        this.position = newPosTime;
    }

    this.updateMainControls();

}


// When touchsstart or mousedown on a seeking area, turn 'seeking' on and seek to cursor
Plugin.prototype.event_seekStart = function(event) {

    if (!this.valid_click(event)) { return true; } // If not valid click, break out of func

    event.preventDefault();

    // Must save which seekwrap (not direct element) is being seeked on!
    this.seekingElement = $(event.target).closest('.seekwrap');

    this.seek(event);
    this.currentlySeeking = true;

    event.stopPropagation();
    return false;

};

// When touchmove or mousemove over a seeking area, seek if seeking has been started
Plugin.prototype.event_seekMove = function(event) {

    if (this.currentlySeeking) {
        event.preventDefault();
        this.seek(event);
        return false;
    }

    event.stopPropagation();

};


// When touchend or mouseup on a seeking area, turn seeking off
Plugin.prototype.event_seekEnd = function(event) {

    event.preventDefault();

    // Since seeking plays only snippits of audio, restart playback if it was playing
    if (this.currentlySeeking && this.playing) {
        this.startAudio();
    }

    this.currentlySeeking = false;

    event.stopPropagation();
    return false;

};


// A shorthandle to resolve click target index number. Used for mute/solo buttons
Plugin.prototype._index_from_target = function(target) {
    return $(target).closest(".track").prevAll().length;
};


// Set or unset solo mode for each track, only change properties
Plugin.prototype.event_solo = function(event) {

    if (!this.valid_click(event)) { return true; } // If not valid click, break out of func

    // Events not prevented/halted as this stops scrolling for full track solo

    var targetIndex = this._index_from_target(event.target);
    var that = this;

    var currentState = this.trackProperties[targetIndex].solo;

    if (event.shiftKey || this.options.radiosolo) {
        $.each(this.trackProperties, function(i, value) {
            that.trackProperties[i].solo = false;
        });
    }

    // If radiosolo option is on and the target is already soloed...
    if ((this.options.radiosolo || event.shiftKey) && currentState) {
        // ...keep the target soloed (must be one track always soloed)
        this.trackProperties[targetIndex].solo = true
    }
    // Else, flip the solo state of the target
    else {
        this.trackProperties[targetIndex].solo = !currentState;
    }

    this.apply_track_properties();

};


// Set or unset mute mode for each track, only change properties
Plugin.prototype.event_mute = function(event) {

    if (!this.valid_click(event)) { return true; } // If not valid click, break out of func

    event.preventDefault();

    var targetIndex = this._index_from_target(event.target);

    // Flip the current mute state of the selected track
    this.trackProperties[targetIndex].mute = !this.trackProperties[targetIndex].mute;

    this.apply_track_properties();

    event.stopPropagation();
    return false;

};


// Cycle through the available images, setting it based on the solo states
Plugin.prototype.switch_image = function() {

    var that = this;
    var numSoloed = 0, imageSrc;

    // For each track that's soloed, set it's image as the image src...
    $.each(this.trackProperties, function(i, value) {
        if (that.trackProperties[i].solo === true){
            numSoloed++;
            imageSrc = that.element.find("ts-track")[i]['dataset']['img'];
        }
    });

    // ...then reset the new source to the original/default if necessary
    if (numSoloed !== 1 || (imageSrc === undefined || imageSrc.length < 1)) {
        imageSrc = this.originalImage;
    }

    // Apply the final image src to the display element
    this.element.find(".seekable").attr('src', imageSrc)

}


// When mute or solo properties changed, apply them to the gain of each track and update UI
Plugin.prototype.apply_track_properties = function() {
    var that = this;

    var anySolos = false;
    $.each(this.trackProperties, function(i, value) {
        anySolos = anySolos || that.trackProperties[i].solo;
    });

    $.each(this.trackProperties, function(i, value) {

      // 1) First update the UI elements to reflect the changes in properties...

        var elem = that.element.find(".track_list li.track:nth-child(" + (i+1) + ")");

        // Update the mute icon status based on track mute state
        if(that.trackProperties[i].mute) {
            elem.find(".mute").addClass('checked');
        }
        else {
            elem.find(".mute").removeClass('checked');
        }

        // Update the solo icon status based on track solo state
        if(that.trackProperties[i].solo) {
            elem.find(".solo").addClass('checked');
        }
        else {
            elem.find(".solo").removeClass('checked');
        }

      // 2) Then update the gains of each track depending on the new properties

        // Filter to stop the gains being edited before activation (gain undefined)
        if (that.trackGainNode.length > 0) {

            that.trackGainNode[i].gain.value = 1;

            // First, only play tracks that are not muted
            if(that.trackProperties[i].mute) {
                that.trackGainNode[i].gain.value = 0;
            }
            else {
                that.trackGainNode[i].gain.value = 1;
            }

            // Then, if there are 1 or more soloed tracks, overwrite with their solo state
            if(anySolos) {
                if(that.trackProperties[i].solo) {
                    that.trackGainNode[i].gain.value = 1;
                }
                else {
                    that.trackGainNode[i].gain.value = 0;
                }
            }

        }

    });

    this.switch_image(); // Now handle the switching of the poster image

    this.deselect();
};


Plugin.prototype.deselect = function(index) {
    var selection = ('getSelection' in window)
        ? window.getSelection()
        : ('selection' in document)
            ? document.selection
            : null;
    if ('removeAllRanges' in selection) selection.removeAllRanges();
    else if ('empty' in selection) selection.empty();
};


$.fn[pluginName] = function(options) {
    return this.each(function () {
        if (!$(this).data('plugin_' + pluginName)) {
            $(this).data('plugin_' + pluginName, new Plugin(this, options));
        }
    });
};
