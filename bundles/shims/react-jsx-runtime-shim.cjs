const R = typeof window !== 'undefined' && window.React ? window.React : {}
function jsx(type, props, key) {
  return R.createElement(type, props, key)
}
function jsxs(type, props, key) {
  return R.createElement(type, props, key)
}
module.exports = {
  jsx,
  jsxs,
  Fragment: R.Fragment
}
