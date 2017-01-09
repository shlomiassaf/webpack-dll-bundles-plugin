const findRoot = require('find-root');
import * as Path from 'path';
import * as fs from 'fs';

import { DllBundleConfig, DllPackageConfig, DllBundlesPluginOptions } from './interfaces';

interface BundleState {
  [key: string]: { bundle: string; version: string; };
}

interface AnalyzedState {
  current: PackageInfo[];
  changed: PackageInfo[];
  added: PackageInfo[];
  removed: PackageInfo[];
  error: PackageInfo[];
}

class PackageInfo implements DllPackageConfig {
  name: string;
  path: string;
  version: string;

  error: Error;

  constructor(public bundle: string, pkg: string | DllPackageConfig) {
    if (typeof pkg === 'string') {
      this.name = this.path = pkg;
    } else {
      this.name = pkg.name;
      this.path = pkg.path;
    }
  }
}

const BUNDLE_STATE_FILENAME: string = 'dll-bundles-state.json';

export class DllBundlesControl {


  constructor(private bundles: DllBundleConfig[], private options: DllBundlesPluginOptions) { }

  /**
   * Check for bundles that requires a rebuild, based on the bundle configuration.
   * Returns the bundles that requires rebuild.
   * @returns {Promise<DllBundleConfig[]>}
   */
  checkBundles(): Promise<DllBundleConfig[]> {
    return this.analyzeState()
      .then( analyzed => {

        // make a list of all bundles that are invalid, this is not related to the analyzed data
        const bundleNames: string[] = this.bundles
          .map( b => b.name )
          .filter( name => this.bundleLooksValid(name) );

        if (analyzed.error.length > 0) {

          analyzed.error.forEach( p => {
            console.error(p.error);
          });

          if (!this.options.ignorePackageError) {
            throw new Error('DllBundlesPlugin: Some packages have errors.');
          }
        }

        // get all bundles that requires changed based on analyzed data
        // this is an aggregation for all bundles that need a rebuild.
        analyzed.added.concat(analyzed.changed).concat(analyzed.removed).concat(analyzed.error)
          .forEach( p => bundleNames.indexOf(p.bundle) === -1 && bundleNames.push(p.bundle) );

        // return the DllHostBundleConfig of all bundles that need a rebuild.
        return bundleNames
          .map( bundleName => this.bundles.filter( bnd => bnd.name === bundleName)[0] )
      });
  }


  /**
   * Collect metadata from all packages in all bundles and save it to a file representing the current
   * state. File is saved in the `dllDir`.
   * @returns {Promise<void>}
   */
  saveBundleState(): Promise<void> {
    return this.getMetadata()
      .then( metadata => {

        const bundleState: BundleState = metadata
          .filter( m => !m.error)
          .reduce( (state, pkg) => {
            state[pkg.name] = { bundle: pkg.bundle, version: pkg.version };
            return state;
          }, {} as any);

        fs.writeFileSync(Path.join(this.options.dllDir, BUNDLE_STATE_FILENAME), JSON.stringify(bundleState, null, 2));
      });
  }


  /**
   * Check if the bundle name is valid.
   * This is a shallow check, it only checks for the existence of files that represent a DLL bundle.
   * @param name
   * @returns {boolean}
   */
  private bundleLooksValid(name: string): boolean {
    return !fs.existsSync(Path.join(this.options.dllDir, `${name}.dll.js`))
      || !fs.existsSync(Path.join(this.options.dllDir, `${name}-manifest.json`));
  }

  /**
   * Collect metadata from all packages in all bundles
   * @returns {Promise<PackageInfo[]>}
   */
  private getMetadata(): Promise<PackageInfo[]> {
    const promises: Promise<PackageInfo>[] = this.bundles
      .map( b => b.packages.map( p => new PackageInfo(b.name, p) ) )
      .reduce( (prev, curr) => prev.concat(curr), [])
      .map( pkgInfo => {
        return this.getPackageJson(pkgInfo.path)
          .then( pkgJson => {
            pkgInfo.version = pkgJson.version;
            if (pkgInfo.name !== pkgJson.name) {
              throw new Error(`Package name mismatch, Expected ${pkgInfo.name} but found ${pkgJson.name} `);
            }
          })
          .catch( err => pkgInfo.error = err )
          .then( () => pkgInfo );
      });

    return Promise.all(promises);
  };

  /**
   * Find the diff between the current bundle state to the last bundle state.
   * The current bundle state is the required bundle state, the bundle information entered by the user.
   * The last bundle state is a representation of the last build saved in JSON file combined with
   * the state of physical packages on the file system.
   * @returns {Promise<AnalyzedState>}
   */
  private analyzeState(): Promise<AnalyzedState> {
    return this.getMetadata() // get metadata for the required bundle configuration
      .then( packages => {
        const result = {
          current: [],
          changed: [],
          added: [],
          removed: [],
          error: []
        };

        const bundleState = this.getBundleSate();
        const pkgCache = {
          del: (pkgInfo: PackageInfo) =>  {
            delete bundleState[pkgInfo.name];
            pkgCache.hist.push(pkgInfo.name);
          },
          deleted: (pkgInfo: PackageInfo) =>  pkgCache.hist.indexOf(pkgInfo.name) > -1,
          hist: []
        };


        // compare to the bundle state, i.e: the last state known
        // we have 4 possible outcomes for each package: No change, version change, added, removed.
        packages.forEach( pkgInfo => {
          if (pkgInfo.error) {
            result.error.push(pkgInfo);
            pkgCache.del(pkgInfo);
          } else if (bundleState.hasOwnProperty(pkgInfo.name)) { // if the old sate has this package:
            if (bundleState[pkgInfo.name].version === pkgInfo.version) {
              result.current.push(pkgInfo);
            } else {
              result.changed.push(pkgInfo);
            }
            // we delete it from the bundle list so at the end we have a bundle state that
            // has packages that were removed
            pkgCache.del(pkgInfo);
          } else { // old package didn't have this package, its new (added)
            if (!pkgCache.deleted(pkgInfo)) {
              // first we check if it wasn't deleted in previous loop
              // this is when 2 names for different paths are set
              // it can happen if the main file is not importing all parts of the package.
              result.added.push(pkgInfo);
            }

          }
        });

        /**
         * All packages left in the bundle state are those removed from last bundle build.
         */
        result.removed = Object.keys(bundleState).map( k => new PackageInfo(bundleState[k].bundle, k) );

        return result;
      });
  }

  /**
   * Load the last metadata state about all packages in all bundles
   * @returns BundleState
   */
  private getBundleSate(): BundleState {
    if (fs.existsSync(Path.join(this.options.dllDir, BUNDLE_STATE_FILENAME))) {
      return <any>require(Path.join(this.options.dllDir, BUNDLE_STATE_FILENAME));
    } else {
      return {} as any;
    }
  }

  /**
   * Returns package json based on a URI.
   *
   * Currently supports only node resolved value.
   *
   * Returns a Promise for future integration with webpack resolve system.
   *
   * @param uri
   * @returns Promise<{name: string, version: string}>
   */
  private getPackageJson(uri: string): Promise<undefined | {name: string, version: string}> {
    try {
      const pkg = require(this.getPackageJsonPath(uri));

      if(!pkg.name || !pkg.version) {
        throw new Error('Invalid package.json');
      }

      return Promise.resolve(pkg);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  private getPackageJsonPath(uri: string): string {
    const location = findRoot(require.resolve(uri));
    return Path.join(location, 'package.json');

    // if (fs.statSync(location).isDirectory()) {
    //   return Path.join(location, 'package.json');
    // } else {
    //   return Path.join(Path.dirname(location), 'package.json');
    // }
  }
}
