import * as webpack from 'webpack';

export type Compiler = webpack.compiler.Compiler;
export type Stats = webpack.compiler.Stats;


export function resolveConfig(config: any): any {
  if(typeof config === 'string') {
    return resolveConfig(require(config));
  } else if (typeof config === 'function') {
    return config();
  } else if (config.__esModule === true && !!config.default) {
    return resolveConfig(config.default);
  } else {
    return config;
  }
}

export function runWebpack(config: any): { compiler: Compiler, done: Promise<Stats> } {
  const compiler = webpack(resolveConfig(config));
  return {
    compiler,
    done: new Promise( (RSV, RJT) => compiler.run((err, stats) => err ? RJT(err) : RSV(stats)) )
  }
}
