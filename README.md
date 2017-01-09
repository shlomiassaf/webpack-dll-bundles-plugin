
# Webpack Dll Bundle plugin
A Plugin for Webpack that uses Webpack's `DllPlugin` & `DllReferencePlugin` to create bundle configurations as part of the build process.
The plugin will monitor for changes in packages and rebuild the bundles accordingly.
## Example:

```
const webpackMerge = require('webpack-merge'); // used to merge webpack configs
const commonConfig = require('./webpack.common.js'); // the settings that are common 


  new DllBundlesPlugin({
    bundles: {
      polyfills: [
        'core-js',
        'zone.js',
      ],
      vendor: [
        '@angular/platform-browser',
        '@angular/platform-browser-dynamic',
        '@angular/core',
        '@angular/common',
        '@angular/forms',
        '@angular/http',
        '@angular/router',
        '@angularclass/hmr',
        'rxjs',
      ]
    },
    dllDir: './dll',
    webpackConfig: webpackMerge(commonConfig({env: ENV}), {
      devtool: 'cheap-module-source-map',
      plugins: [] // DllBundlesPlugin will set the DllPlugin here
    })
  })
  
  
```

> **webpackConfig** Accepts a path (string), webpack config object or webpack config object factory.  
`DllBundlesPlugin` will override the entry and add the DllPlugins requires.  
`DllBundlesPlugin` will also add the `DllReferencePlugin` to the webpack configuration it is defined on.

## Referencing Dll files
Currently, the file name templates for dll's is locked, you can get a projected file name for a dll using the `resolveFile` function.

```
  new AddAssetHtmlPlugin([
    { filepath: helpers.root(`dll/${DllBundlesPlugin.resolveFile('polyfills')}`) },
    { filepath: helpers.root(`dll/${DllBundlesPlugin.resolveFile('vendor')}`) }
  ])
```

## TODO
  - Watch files/package.json for changes and rebuild
  - Move package resolution to webpack (now using node require)
  - Allow setting the template for file names.
  - Documentation