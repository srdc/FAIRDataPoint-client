module.exports = {
  publicPath: process.env.NODE_ENV === 'production'
    ? '/app/'
    : '/',
  devServer: {
    proxy: {
      '/excel-extraction': {
        target: process.env.EXTRACTOR_URL || 'http://localhost:4000',
        changeOrigin: true,
        pathRewrite: { '^/excel-extraction': '' },
      },
    },
  },
  configureWebpack: {
    resolve: {
      fallback: {
        querystring: require.resolve('querystring-es3'),
        url: require.resolve('url/'),
      },
    },
  },
  css: {
    loaderOptions: {
      css: {
        url: false,
      },
    },
  },
}
