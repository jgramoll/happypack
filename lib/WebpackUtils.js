var async = require('async');
var assert = require('assert');

exports.normalizeLoader = function(input) {
  var normals;

  // happypack variant:
  if (typeof input === 'object' && input.hasOwnProperty('path')) {
    normals = [ objectAssign({}, input) ];
  }
  // webpack object variant:
  else if (typeof input === 'object') {
    normals = [].concat(exports.extractLoaders(input));
  }
  // webpack/happypack string loader(s):
  else if (typeof input === 'string') {
    normals = [].concat(extractPathAndQueryFromString(input));
  }

  return normals.map(function(loader) {
    // normalize the query so that it is always a string prefixed by '?'
    if (loader.query) {
      if (typeof loader.query === 'object') {
        loader.query = '?' + JSON.stringify(loader.query);
      }
      else if (typeof loader.query === 'string') {
        loader.query = ensureHasLeadingMarker(loader.query);
      }
    }

    // be compatible with webpack's syntax within our own: if they specify
    // a loader's path using a "loader" attribute, map it to the "path" one
    if (loader.loader) {
      loader.path = loader.loader;
      delete loader.loader;
    }

    return loader;
  });
};

/**
 * Extract the set of loaders (one or more) from a given a "module.loaders"
 * webpack config entry.
 *
 * This does NOT perform any normalization on the query, so the query may be
 * a string (prefixed by '?' or not) or it may be an object.
 *
 * Example inputs/outputs:
 *
 *     // a loader chain
 *     {
 *       loaders: [ 'style', 'css' ]
 *     }
 *     // => [ "style", "css" ]
 *
 *     // another loader chain
 *     {
 *       loaders: [ 'style!css' ]
 *     }
 *     // => [ "style!css" ]
 *
 *     // a single loader, no query:
 *     {
 *       loader: 'babel'
 *     }
 *     // => [ "babel" ]
 *
 *     // a single loader with inline query:
 *     {
 *       loader: 'babel?presets[]=react'
 *     }
 *     // => [ "babel?presets[]=react" ]
 *
 *     // a single loader with a query object:
 *     {
 *       loader: 'babel',
 *       query: { presets: [ 'react' ] }
 *     }
 *     // => [ "babel?presets[]=react" ]
 *
 *     // webpack 2: multiple loaders with object / string combinations:
 *     {
 *       loaders: [
 *         'react-hot',
 *         { loader: 'babel', query: { presets: [ 'react' ] } },
 *       ]
 *     }
 *
 * @param  {Object|String} entry
 * @param  {?Array.<String|Object>} entry.loaders
 * @param  {!String} entry.loader
 * @param  {?Object|String} entry.query
 *
 * @return {Object|Array.<Object>}
 */
exports.extractLoaders = function extractLoaders(entry) {
  if (typeof entry === 'object' && entry.loaders) {
    return entry.loaders.reduce(function(list, loader) {
      return list.concat(extractLoaders(loader));
    }, []);
  }
  else if (typeof entry === 'string') {
    return extractPathAndQueryFromString(entry);
  }
  else if (typeof entry.loader === 'string' && entry.query) {
    return { path: entry.loader, query: entry.query };
  }
  else if (typeof entry.loader === 'string' && entry.options) {
    return { path: entry.loader, query: '?' + JSON.stringify(entry.options) };
  }
  else if (typeof entry.loader === 'string') {
    return extractPathAndQueryFromString(entry.loader);
  }
  else {
    console.error(entry);
    assert(false, "HappyPack: Unrecognized loader configuration variant!");
  }
};

exports.resolveLoaders = function(compiler, loaders, done) {
  async.parallel(loaders.map(function(loader) {
    assert(!!loader, "Invalid loader string to resolve!!! " + JSON.stringify(loaders));

    return function(callback) {
      resolveLoader(compiler.context, loader, nAry(2)(callback));
    };
  }), done);

  function resolveLoader(context, loader, callback) {
    if (compiler.resolvers.loader.resolve) {
      var resolveContext = compiler.resolvers.loader;
      var resolve = resolveContext.resolve;

      // webpack2 has changed the signature for the resolve method where it accepts
      // a fourth argument (context), so we need to sniff and support both versions
      //
      // fixes #23
      if (resolve.length === 4) {
        resolve.apply(resolveContext, [ context, context, loader, callback ])
      }
      else {
        resolve.apply(resolveContext, [ context, loader, callback ]);
      }
    }
    // webpack 4 has removed compiler.resolvers.loader
    else {
      // compiler.resolverFactory.plugin("resolver loader", resolver => {
      //   console.log('wtf')
      //   resolver.plugin()
      // })

      // console.log('a', compiler.resolverFactory.hooks.resolver)
      // console.log('a', compiler.resolverFactory.hooks.resolver.get('loader').call())
      
      // var t = compiler.resolverFactory
      // console.log('a', t.resolvers)
      // console.log('b', t.loader)
      // console.log('c', t.hooks)
      // console.log('d', t.hooks.resolver)
      // compiler.resolverFactory.hooks.resolveOptions.get('loader').call({})
      // console.log('e', t)
      // var resolverLoader = compiler.resolverFactory.get('resolve loader', {});
      // resolverLoader.resolve(context, context, loader, resolverLoader, callback);
    }
  }
};

exports.applyLoaders = require('./applyLoaders');

function extractPathAndQueryFromString(string) {
  var loaders = string.split('!');

  if (loaders.length > 1) {
    return loaders.map(extractPathAndQueryFromString);
  }

  var loaderString = loaders[0];
  var fragments = loaderString.split('?');

  if (fragments.length === 1) {
    return { path: loaderString };
  }

  return { path: fragments[0], query: '?' + fragments[1] };
}

function ensureHasLeadingMarker(queryString) {
  return queryString[0] === '?' ? queryString : ('?' + queryString);
}

function objectAssign(target) {
  var sources = [].slice.call(arguments, 1);

  return sources.reduce(function(map, source) {
    Object.keys(source).forEach(function(key) {
      map[key] = source[key];
    });

    return map;
  }, target);
}

function nAry(n) {
  return function(f) {
    return function() {
      return f.apply(null, Array.prototype.slice.call(arguments, 0, n))
    }
  }
}
exports.objectAssign = objectAssign;