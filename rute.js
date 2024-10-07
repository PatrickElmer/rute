const _root = document.getElementById('rute') || document.body
let _rute = {
    ext: _root.getAttribute('ext') || 'html',
    dir: _root.getAttribute('dir') || 'pages',
    version: _root.getAttribute('version') || '',
    page_404: _root.getAttribute('404'),
    default: _root.getAttribute('default') || 'index',
}

let rute = {}

window.addEventListener('DOMContentLoaded', onRouteChange)
window.addEventListener('hashchange', onRouteChange)

async function onRouteChange() {
    let hashParams = getHashParams()
    const res = await fetch(`${_rute.dir}/${hashParams.hash}.${_rute.ext}`)
    const content = res.ok
        ? (_rute.ext === 'json' ? await res.json() : await res.text())
        : (_rute.page_404 || `<h1>${res.status}</h1><p>${res.statusText}</p>`)
    updateContent(apply_conversions(content, hashParams))
}

function getHashParams() {
    const [hash, query] = window.location.hash.split('?', 2)
    return {
        'hash': hash.substring(1).replace(/^\//, '') || _rute.default,
        'query': Object.fromEntries(new URLSearchParams(query || window.location.search).entries())
    }
}

function apply_conversions(content, data) {
    Object.values(rute).forEach(fn => { content = fn(content, data) })
    return content
}

function updateContent(content) {
    _root.innerHTML = content
    _root.scrollTo(0, 0)
}
