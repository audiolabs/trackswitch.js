---
title: trackswitch.js
---

 - [Initialization](#initialization)
 - [Configuration](#configuration)
   - [Tracks](#tracks)
     - [Fallback Audio Files](#fallback-audio-files)
     - [Track Styling](#track-styling)
     - [Solo Tracks](#solo-tracks)
     - [Mute Tracks](#mute-tracks)
   - [Player Behaviour](#player-behaviour)
   - [Additional Player Elements](#additional-player-elements)
     - [Additional and Seekable Player Image](#additional-and-seekable-player-image)
     - [Seekable Image Start/Stop Margin](#seekable-image-startstop-margin)
     - [Seekable Image For Each Track](#seekable-image-for-each-track)
     - [Seekable Image Styling](#seekable-image-styling)

# Initialization

Trackswitch requires jQuery and Fontawesome to be included to work, e.g.

```html
<!-- ... -->

<link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" rel="stylesheet" integrity="sha384-wvfXpqpZZVQGK6TAh5PVlGOfQNHSoD2xbE+QkPxCAFlNEevoEH3Sl0sibVcOQVnN" crossorigin="anonymous" />
<link rel="stylesheet" href="trackswitch.min.css" />

<!-- ... -->

<div class="player">
  <p>
      Example trackswitch.js instance.
  </p>
  <img src="mix.png" class="seekable"/>
  <ts-track title="Drums" data-img="drums.png">
      <ts-source src="drums.mp3" type="audio/mpeg"></ts-source>
  </ts-track>
  <ts-track title="Synth" data-img="synth.png">
      <ts-source src="synth.mp3" type="audio/mpeg"></ts-source>
  </ts-track>
  <ts-track title="Bass" data-img="bass.png">
      <ts-source src="bass.mp3" type="audio/mpeg"></ts-source>
  </ts-track>
  <ts-track title="Violins" data-img="violins.png">
      <ts-source src="violins.mp3" type="audio/mpeg"></ts-source>
  </ts-track>
</div>

<!-- ... -->

<script src="https://code.jquery.com/jquery-3.2.1.min.js" integrity="sha256-hwg4gsxgFZhOsEEamdOYGBf13FyQuiTwlAQgxVSNgt4="crossorigin="anonymous"></script>
<script src="trackswitch.min.js"></script>
<script type="text/javascript">
    jQuery(document).ready(function() {
        jQuery(".player").trackSwitch({spacebar: true});
    });
</script>

<!-- ... -->
```

Alternatively you can of course use [Browserify](http://browserify.org/).


# Configuration

## Tracks

Each track is contained in one `ts-track` element and must contain one or more `ts-source` elements:

```html
<div class="player">
    <ts-track title="Violins">
        <ts-source src="violins.mp3"></ts-source>
    </ts-track>
    <ts-track title="Synth">
        <ts-source src="synth.mp3"></ts-source>
    </ts-track>
    <ts-track title="Bass">
        <ts-source src="bass.mp3"></ts-source>
    </ts-track>
    <ts-track title="Drums">
        <ts-source src="drums.mp3"></ts-source>
    </ts-track>
</div>
```

<div class="player">
    <ts-track title="Violins">
        <ts-source src="data/multitracks/violins.mp3"></ts-source>
    </ts-track>
    <ts-track title="Synth">
        <ts-source src="data/multitracks/synth.mp3"></ts-source>
    </ts-track>
    <ts-track title="Bass">
        <ts-source src="data/multitracks/bass.mp3"></ts-source>
    </ts-track>
    <ts-track title="Drums">
        <ts-source src="data/multitracks/drums.mp3"></ts-source>
    </ts-track>
</div>

Note that each `ts-source` should always contain a closing element.

### Fallback Audio Files

Due to a [messy Browser compatibility situation](https://developer.mozilla.org/en-US/docs/Web/HTML/Supported_media_formats#Browser_compatibility) it is recommended you define multiple `ts-source`s with different formats for each `ts-track`.

It is recommended, but not required, that you to define the [MIME type](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Complete_list_of_MIME_types) in each `ts-source`.

```html
<div class="player">
    <ts-track title="Violins">
        <ts-source src="violins.mp3" type="audio/mpeg"></ts-source>
        <ts-source src="violins.mp4" type="audio/mp4"></ts-source>
    </ts-track>
    <ts-track title="Synth">
        <ts-source src="synth.mp3" type="audio/mpeg"></ts-source>
        <ts-source src="synth.mp4" type="audio/mp4"></ts-source>
    </ts-track>
    <ts-track title="Bass">
        <ts-source src="bass.mp3" type="audio/mpeg"></ts-source>
        <ts-source src="bass.mp4" type="audio/mp4"></ts-source>
    </ts-track>
    <ts-track title="Drums">
        <ts-source src="drums.mp3" type="audio/mpeg"></ts-source>
        <ts-source src="drums.mp4" type="audio/mp4"></ts-source>
    </ts-track>
</div>
```

### Track Styling

You can use CSS to style each individual `ts-track` element:

```html
<div class="player">
    <ts-track title="Violins" style="background-color: #156090;">
        <ts-source src="violins.mp3"></ts-source>
    </ts-track>
    <ts-track title="Synth" style="background-color: #15737D;">
        <ts-source src="synth.mp3"></ts-source>
    </ts-track>
    <ts-track title="Bass" style="background-color: #158769;">
        <ts-source src="bass.mp3"></ts-source>
    </ts-track>
    <ts-track title="Drums" style="background-color: #159858;">
        <ts-source src="drums.mp3"></ts-source>
    </ts-track>
</div>
```

<div class="player">
    <ts-track title="Violins" style="background-color: #156090;">
        <ts-source src="data/multitracks/violins.mp3"></ts-source>
    </ts-track>
    <ts-track title="Synth" style="background-color: #15737D;">
        <ts-source src="data/multitracks/synth.mp3"></ts-source>
    </ts-track>
    <ts-track title="Bass" style="background-color: #158769;">
        <ts-source src="data/multitracks/bass.mp3"></ts-source>
    </ts-track>
    <ts-track title="Drums" style="background-color: #159858;">
        <ts-source src="data/multitracks/drums.mp3"></ts-source>
    </ts-track>
</div>

### Solo Tracks

You can preselect **solo** for individual tracks by using the `solo` attribute within the `ts-track` element, like this: `<ts-track title="Violins" solo>`.

```html
<div class="player">
    <ts-track title="Violins" solo>
        <ts-source src="violins.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
    <ts-track title="Synth" solo>
        <ts-source src="synth.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
    <ts-track title="Bass">
        <ts-source src="bass.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
    <ts-track title="Drums">
        <ts-source src="drums.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
</div>
```

<div class="player">
    <ts-track title="Violins" solo>
        <ts-source src="data/multitracks/violins.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
    <ts-track title="Synth" solo>
        <ts-source src="data/multitracks/synth.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
    <ts-track title="Bass">
        <ts-source src="data/multitracks/bass.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
    <ts-track title="Drums">
        <ts-source src="data/multitracks/drums.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
</div>

### Mute Tracks

You can preselect **mute** for individual tracks by using the `mute` attribute within the `ts-track` element, like this: `<ts-track title="Bass" mute>`.

```html
<div class="player">
    <ts-track title="Violins">
        <ts-source src="violins.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
    <ts-track title="Synth">
        <ts-source src="synth.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
    <ts-track title="Bass" mute>
        <ts-source src="bass.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
    <ts-track title="Drums" mute>
        <ts-source src="drums.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
</div>
```

<div class="player">
    <ts-track title="Violins">
        <ts-source src="data/multitracks/violins.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
    <ts-track title="Synth">
        <ts-source src="data/multitracks/synth.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
    <ts-track title="Bass" mute>
        <ts-source src="data/multitracks/bass.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
    <ts-track title="Drums" mute>
        <ts-source src="data/multitracks/drums.mp3" type="audio/mpeg"></ts-source>
    </ts-track>
</div>

## Player Behaviour

The player allows for several different settings to be enabled or disabled. This is done using a settings object, for example:

```javascript
var settings = {
    onlyradiosolo: true,
    repeat: true,
};
$(".player").trackSwitch(settings);
```

<div class="customplayer">
    <ts-track title="Violins">
        <ts-source src="data/multitracks/violins.mp3"></ts-source>
    </ts-track>
    <ts-track title="Synth">
        <ts-source src="data/multitracks/synth.mp3"></ts-source>
    </ts-track>
    <ts-track title="Bass">
        <ts-source src="data/multitracks/bass.mp3"></ts-source>
    </ts-track>
    <ts-track title="Drums">
        <ts-source src="data/multitracks/drums.mp3"></ts-source>
    </ts-track>
</div>

Any combination of the following boolean flags is possible, where the indicated value depicts the default value.

 - `mute`: If `true` show mute buttons. Defaults to `true`.
 - `solo`: If `true` show solo buttons. Defaults to `true`.
 - `globalsolo`: If `true` mute all other trackswitch instances when playback starts. Defaults to `true`.
 - `repeat`: If `true` initialize player with repeat button enabled. Defaults to `false`.
 - `radiosolo`: If `true` allow only 1 track to be soloed at a time (makes the <kbd>shift</kbd>+<i class="fa fa-mouse-pointer" aria-hidden="true"></i>click behaviour the default). Useful for comparing rather than mixing tracks. Defaults to `false`.
 - `onlyradiosolo`: If `true` sets both `mute: false` and `radiosolo: true` in one argument. Useful for one track at a time comparison. Also makes the whole track row clickable. Defaults to `false`.
 - `spacebar`: If `true` bind the <kbd>spacebar</kbd> key to play/pause. Can be turned on for more than one player, but only affect the most recently activated. Defaults to `false`.
 - `tabview`: If `true` change the layout so tracks are arranged in a 'tab view'. This saves vertical space, for example on a presentation. Defaults to `false`.


## Additional Player Elements

You can add aditional elements directly into the player, e.g. a paragraph `<p>` with some custom styling.

```html
<div class="player">
    <p style="text-align: center;">Example with padded and centered text.</p>
    <ts-track title="Violins">
        <ts-source src="violins.mp3"></ts-source>
    </ts-track>
    <ts-track title="Synth">
        <ts-source src="synth.mp3"></ts-source>
    </ts-track>
    <ts-track title="Bass">
        <ts-source src="bass.mp3"></ts-source>
    </ts-track>
    <ts-track title="Drums">
        <ts-source src="drums.mp3"></ts-source>
    </ts-track>
</div>
```

<div class="player">
    <p style="text-align: center;">Example with padded and centered text.</p>
    <ts-track title="Violins">
        <ts-source src="data/multitracks/violins.mp3"></ts-source>
    </ts-track>
    <ts-track title="Synth">
        <ts-source src="data/multitracks/synth.mp3"></ts-source>
    </ts-track>
    <ts-track title="Bass">
        <ts-source src="data/multitracks/bass.mp3"></ts-source>
    </ts-track>
    <ts-track title="Drums">
        <ts-source src="data/multitracks/drums.mp3"></ts-source>
    </ts-track>
</div>

### Additional and Seekable Player Image

You can include images related to the audio content, which can optionally act as a seekable play-head area (similar to the SoundCloud player for example). In the example below, the player below will contain two images, the first of which will also act as a seekable player. **Any number of the images can be set, but only one seekable image is acceptable**.

```html
<div class="player">
    <img class="seekable" src="mix.png">
    <img src="cover.jpg">
    <ts-track title="Violins">
        <ts-source src="violins.mp3"></ts-source>
    </ts-track>
    <ts-track title="Synth">
        <ts-source src="synth.mp3"></ts-source>
    </ts-track>
    <ts-track title="Bass">
        <ts-source src="bass.mp3"></ts-source>
    </ts-track>
    <ts-track title="Drums">
        <ts-source src="drums.mp3"></ts-source>
    </ts-track>
</div>
```

<div class="player">
    <img class="seekable" src="data/multitracks/mix.png" />
    <ts-track title="Violins">
        <ts-source src="data/multitracks/violins.mp3"></ts-source>
    </ts-track>
    <ts-track title="Synth">
        <ts-source src="data/multitracks/synth.mp3"></ts-source>
    </ts-track>
    <ts-track title="Bass">
        <ts-source src="data/multitracks/bass.mp3"></ts-source>
    </ts-track>
    <ts-track title="Drums">
        <ts-source src="data/multitracks/drums.mp3"></ts-source>
    </ts-track>
</div>

### Seekable Image Start/Stop Margin

As you can see, the start end end times of the plot don't exactly match with
the seekhead. In this situation you can specify the seekable area margin for each seekable image.

This can be done by specifying the start and stop points as a percentage of the image using the `data-seek-margin-left` and `data-seek-margin-right` attributes.

```html
<div class="player">
    <img class="seekable" data-seek-margin-left="4" data-seek-margin-right="4" src="mix.png">
    <ts-track title="Violins" data-img="violins.png">
        <ts-source src="violins.mp3"></ts-source>
    </ts-track>
    <ts-track title="Synth" data-img="synth.png">
        <ts-source src="synth.mp3"></ts-source>
    </ts-track>
    <ts-track title="Bass" data-img="bass.png">
        <ts-source src="bass.mp3"></ts-source>
    </ts-track>
    <ts-track title="Drums" data-img="drums.png">
        <ts-source src="drums.mp3"></ts-source>
    </ts-track>
</div>
  ```

<div class="player">
    <img class="seekable" data-seek-margin-left="4" data-seek-margin-right="4" src="data/multitracks/mix.png">
    <ts-track title="Violins" data-img="data/multitracks/violins.png">
        <ts-source src="data/multitracks/violins.mp3"></ts-source>
    </ts-track>
    <ts-track title="Synth" data-img="data/multitracks/synth.png">
        <ts-source src="data/multitracks/synth.mp3"></ts-source>
    </ts-track>
    <ts-track title="Bass" data-img="data/multitracks/bass.png">
        <ts-source src="data/multitracks/bass.mp3"></ts-source>
    </ts-track>
    <ts-track title="Drums" data-img="data/multitracks/drums.png">
        <ts-source src="data/multitracks/drums.mp3"></ts-source>
    </ts-track>
</div>


### Seekable Image For Each Track

You can optionally define a more specific image to replace the default when a particular track is played back in solo. This is done by adding an image link in the `data-img` attribute of the chosen `ts-track` element, as seen below.

```html
<div class="player">
    <img class="seekable" data-seek-margin-left="4" data-seek-margin-right="4" src="mix.png">
    <ts-track title="Violins" data-img="violins.png">
        <ts-source src="violins.mp3"></ts-source>
    </ts-track>
    <ts-track title="Synth" data-img="synth.png">
        <ts-source src="synth.mp3"></ts-source>
    </ts-track>
    <ts-track title="Bass" data-img="bass.png">
        <ts-source src="bass.mp3"></ts-source>
    </ts-track>
    <ts-track title="Drums" data-img="drums.png">
        <ts-source src="drums.mp3"></ts-source>
    </ts-track>
</div>
```

<div class="customplayer">
    <img class="seekable" data-seek-margin-left="4" data-seek-margin-right="4" src="data/multitracks/mix.png">
    <ts-track title="Violins" data-img="data/multitracks/violins.png">
        <ts-source src="data/multitracks/violins.mp3"></ts-source>
    </ts-track>
    <ts-track title="Synth" data-img="data/multitracks/synth.png">
        <ts-source src="data/multitracks/synth.mp3"></ts-source>
    </ts-track>
    <ts-track title="Bass" data-img="data/multitracks/bass.png">
        <ts-source src="data/multitracks/bass.mp3"></ts-source>
    </ts-track>
    <ts-track title="Drums" data-img="data/multitracks/drums.png">
        <ts-source src="data/multitracks/drums.mp3"></ts-source>
    </ts-track>
</div>

In the example above, there is a default image as well as specific images defined for the track.

You do not need to define a specific image for every track. If there is no image defined for a track when it is soloed, the default image will be used.

### Seekable Image Styling

The images can be positioned using normal CSS (eg, `width` and `margin` properties). For non-seekable images, this style can be applied using the `style` attribute.

**For `seekable` images this style must be defined in a 'data-style' properly rather than the usual 'style' property.**

```html
<div class="player">
    <img style="margin: 20px auto;" src="cover.jpg">
    <img data-style="width: 80%; margin: auto;" class="seekable" data-seek-margin-left="4" data-seek-margin-right="4" src="mix.png">
    <ts-track title="Violins" data-img="violins.png">
        <ts-source src="violins.mp3"></ts-source>
    </ts-track>
    <ts-track title="Synth" data-img="synth.png">
        <ts-source src="synth.mp3"></ts-source>
    </ts-track>
    <ts-track title="Bass" data-img="bass.png">
        <ts-source src="bass.mp3"></ts-source>
    </ts-track>
    <ts-track title="Drums" data-img="drums.png">
        <ts-source src="drums.mp3"></ts-source>
    </ts-track>
</div>
```

<div class="player">
    <img style="margin: 20px auto;" src="data/multitracks/cover.jpg">
    <img data-style="width: 80%; margin: auto;" class="seekable" data-seek-margin-left="4" data-seek-margin-right="4" src="data/multitracks/mix.png">
    <ts-track title="Violins" data-img="data/multitracks/violins.png">
        <ts-source src="data/multitracks/violins.mp3"></ts-source>
    </ts-track>
    <ts-track title="Synth" data-img="data/multitracks/synth.png">
        <ts-source src="data/multitracks/synth.mp3"></ts-source>
    </ts-track>
    <ts-track title="Bass" data-img="data/multitracks/bass.png">
        <ts-source src="data/multitracks/bass.mp3"></ts-source>
    </ts-track>
    <ts-track title="Drums" data-img="data/multitracks/drums.png">
        <ts-source src="data/multitracks/drums.mp3"></ts-source>
    </ts-track>
</div>
