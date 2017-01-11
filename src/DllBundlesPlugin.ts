const DllPlugin = require('webpack/lib/DllPlugin');
const DllReferencePlugin = require('webpack/lib/DllReferencePlugin');

import * as Path from 'path';
import { runWebpack } from './utils';

import { DllBundlesPluginOptions, DllBundleConfig } from './interfaces';
import { DllBundlesControl } from './DllBundlesControl';

export class DllBundlesPlugin {
  private compiler: any;
  private bundles: DllBundleConfig[];
  private bundleControl: DllBundlesControl;
  private options: DllBundlesPluginOptions;

  constructor(options: DllBundlesPluginOptions) {
    this.setOptions(options);
  }

  apply(compiler: any) {
    this.compiler = compiler;

    const newPlugins = this.bundles.map( b => new DllReferencePlugin({
        context: this.options.context,
        manifest: Path.join(this.options.dllDir, `${b.name}-manifest.json`)
      }));

    newPlugins.forEach(p => p.apply(compiler));
    compiler.options.plugins.push(...newPlugins);

    compiler.plugin('run', (compiler, next) => this.run(next) );
    compiler.plugin('watch-run', (compiler, next) => this.run(next) );
  }


  run(next: (err?: Error) => any): void {
    console.info('DLL: Checking if DLLs are valid.');
    this.bundleControl.checkBundles()
      .then( bundles => {
        if (bundles.length === 0) {
          return console.info('DLL: All DLLs are valid.');
        } else {
          console.info('DLL: Rebuilding...');

          const newEntry = this.bundles.reduce( (prev, curr) => {
            prev[curr.name] = curr.packages.map( p => typeof p === 'string' ? p : p.path );
            return prev;
          }, {} as any);

          const webpackConfig = Object.assign({}, this.options.webpackConfig, {
            entry: newEntry,
            output: {
              path: this.options.dllDir,
              filename: '[name].dll.js',
              library: '[name]_lib'
            },
          });


          if (!webpackConfig.plugins) {
            webpackConfig.plugins = [];
          }
          webpackConfig.plugins.push(new DllPlugin({
            path: Path.join(this.options.dllDir, '[name]-manifest.json'),
            name: '[name]_lib',
          }));

          return runWebpack(webpackConfig).done
            .then( stats => this.bundleControl.saveBundleState() )
            .then( () => console.info('DLL: Bundling done, all DLLs are valid.') );
        }
      })
      .then( () => next() )
      .catch( err => next(err) );
  }

  private setOptions(options: DllBundlesPluginOptions): void {
    this.options = Object.assign({}, options);

    if (this.options.context) {
      this.options.context = process.cwd();
    }

    if (!Path.isAbsolute(this.options.context)) {
      throw new Error('Context must be an absolute path');
    }

    if (!Path.isAbsolute(this.options.dllDir)) {
      this.options.dllDir = Path.resolve(this.options.context, this.options.dllDir);
    }

    const bundles = this.options.bundles;
    this.bundles = Object.keys(bundles).map( k => ({ name: k, packages: bundles[k] }) );

    this.bundleControl = new DllBundlesControl(this.bundles, this.options);
  }

  static resolveFile(bundleName: string): string {
    return `${bundleName}.dll.js`;
  }
}
