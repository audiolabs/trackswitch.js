trackswitch.js
==============

[![Screenshot](/examples/screenshot.png)](https://audiolabs.github.io/trackswitch.js/)

Installation
------------

This tool can be installed using

    npm install trackswitch

alternatively you can manually download and include [`dist/css/trackswitch.min.css`](https://raw.githubusercontent.com/audiolabs/trackswitch.js/gh-pages/dist/css/trackswitch.min.css) and
[`dist/js/trackswitch.min.js`](https://raw.githubusercontent.com/audiolabs/trackswitch.js/gh-pages/dist/js/trackswitch.min.js).


## Whats included

    dist/
    ├── css/
    │   ├── trackswitch.min.css
    └── js/
        ├── trackswitch.js
        └── trackswitch.min.js


Citation
--------

If you use this software in a scientific publication, please make sure to cite the following publication

Werner, Nils, et al. **"trackswitch.js: A Versatile Web-Based Audio Player for Presenting Scientific Results."** 3rd web audio conference, London, UK. 2017.

    @inproceedings{werner2017trackswitchjs,
      title={trackswitch.js: A Versatile Web-Based Audio Player for Presenting Scientific Results},
      author={Nils Werner and Stefan Balke and Fabian-Rober Stöter and Meinard Müller and Bernd Edler},
      booktitle={3rd web audio conference, London, UK},
      year={2017},
      organization={Citeseer}
    }


Examples
--------

### Configuration

See [configuration examples](https://audiolabs.github.io/trackswitch.js/configuration.html).

### Usage scenarios

See [examples](https://audiolabs.github.io/trackswitch.js/examples.html).

Development
-----------

    npm install
    npm run build

This will compile Sass, concatenate files, and minify CSS/JS into the `dist/` folder.

### Build Scripts

- `npm run build` - Full build (clean, compile, minify)
- `npm run build:css` - Compile and minify CSS only
- `npm run build:js` - Concatenate and minify JS only
- `npm run clean` - Remove `dist/` folder