// `Rute`, `rute`, `templates` and `requests` are globals from rute.js and index.html.

const stubFetch = globalThis.fetch

// Show `html` for `route` and wait until it is rendered.
// replaceState changes the hash without firing hashchange, so only this init runs.
async function go(route, html) {
  if (html !== undefined) templates[`templates/${route}.html`] = html
  history.replaceState(null, '', `#/${route}`)
  await rute.init()
  return rute.root
}

// Run `fn` with console.error captured; returns the logged calls.
async function captureErrors(fn) {
  const errors = []
  const original = console.error
  console.error = (...args) => {
    errors.push(args) // return undefined, like the real console.error
  }
  try {
    await fn()
  } finally {
    console.error = original
  }
  return errors
}

QUnit.hooks.beforeEach(async () => {
  await rute.loading // let the initial page load finish first
  requests.length = 0
})

QUnit.hooks.afterEach(() => {
  rute.reset()
  rute.clear()
  globalThis.fetch = stubFetch
  for (const url of Object.keys(templates)) delete templates[url]
  history.replaceState(null, '', location.pathname + location.search)
})

QUnit.module('routes', () => {
  QUnit.test('isInvalidRoute rejects unsafe routes', assert => {
    for (const route of ['', 'a b', 'a%20b', 'a:b', 'a?b', 'a#b', 'a\\b', '..', '../x', 'a/../b']) {
      assert.true(Rute.isInvalidRoute(route), JSON.stringify(route))
    }
  })

  QUnit.test('isInvalidRoute accepts normal routes', assert => {
    for (const route of ['index', 'about', 'docs/intro', 'a.b', 'a..b', 'my-page_2']) {
      assert.false(Rute.isInvalidRoute(route), JSON.stringify(route))
    }
  })

  QUnit.test('hash strips the # and leading slashes', assert => {
    for (const hash of ['#about', '#/about', '#///about']) {
      history.replaceState(null, '', hash)
      assert.strictEqual(rute.hash, 'about', hash)
    }
  })

  QUnit.test('hash falls back to the default route', assert => {
    for (const hash of ['', '#', '#/', '#/a b', '#/../secret']) {
      history.replaceState(null, '', hash || location.pathname)
      assert.strictEqual(rute.hash, 'index', JSON.stringify(hash))
    }
  })

  QUnit.test('hashKey is scoped to the current route', assert => {
    history.replaceState(null, '', '#/about')
    assert.strictEqual(rute.hashKey('count'), 'rute_hash_about_count')
  })
})

QUnit.module('setup', () => {
  QUnit.test('uses defaults when the root has no attributes', assert => {
    const r = new Rute(document.createElement('div'))
    assert.strictEqual(r.default, 'index')
    assert.strictEqual(r.dir, 'templates/')
    assert.strictEqual(r.ext, '.html')
    assert.strictEqual(r.page404, null)
  })

  QUnit.test('reads default, dir, ext and 404 from the root', assert => {
    const root = document.createElement('div')
    root.setAttribute('default', 'home')
    root.setAttribute('dir', 'pages/')
    root.setAttribute('ext', '.htm')
    root.setAttribute('404', '<p>Missing</p>')
    const r = new Rute(root)
    assert.strictEqual(r.default, 'home')
    assert.strictEqual(r.dir, 'pages/')
    assert.strictEqual(r.ext, '.htm')
    assert.strictEqual(r.page404, '<p>Missing</p>')
  })

  QUnit.test('finds the <rute> element on the page', assert => {
    assert.strictEqual(rute.root, document.querySelector('rute'))
  })
})

QUnit.module('loading templates', () => {
  QUnit.test('fetches dir + route + ext and renders it', async assert => {
    const root = await go('about', '<p>About page</p>')
    assert.deepEqual(requests, ['templates/about.html'])
    assert.strictEqual(root.innerHTML, '<p>About page</p>')
  })

  QUnit.test('loads the default route when there is no hash', async assert => {
    templates['templates/index.html'] = '<p>Home</p>'
    history.replaceState(null, '', location.pathname + location.search)
    await rute.init()
    assert.deepEqual(requests, ['templates/index.html'])
    assert.strictEqual(rute.root.textContent, 'Home')
  })

  QUnit.test('supports routes in subfolders', async assert => {
    const root = await go('docs/intro', '<p>Intro</p>')
    assert.deepEqual(requests, ['templates/docs/intro.html'])
    assert.strictEqual(root.textContent, 'Intro')
  })

  QUnit.test('uses the root attributes of its own instance', async assert => {
    const root = document.createElement('div')
    root.setAttribute('dir', 'pages/')
    root.setAttribute('ext', '.htm')
    templates['pages/about.htm'] = '<p>Custom</p>'
    history.replaceState(null, '', '#/about')
    await new Rute(root).init()
    assert.deepEqual(requests, ['pages/about.htm'])
    assert.strictEqual(root.textContent, 'Custom')
  })

  QUnit.test('navigates when the hash changes', async assert => {
    templates['templates/about.html'] = '<p>About page</p>'
    const changed = new Promise(resolve =>
      addEventListener('hashchange', resolve, { once: true })
    )
    location.hash = '#/about'
    await changed
    await rute.loading
    assert.strictEqual(rute.root.textContent, 'About page')
  })

  QUnit.test('shows the status for a missing template', async assert => {
    const root = await go('missing')
    assert.strictEqual(root.innerHTML, '<h1>404</h1><p>Not Found</p>')
  })

  QUnit.test('shows the 404 page for a missing template', async assert => {
    rute.page404 = '<p>Custom 404</p>'
    try {
      const root = await go('missing')
      assert.strictEqual(root.innerHTML, '<p>Custom 404</p>')
    } finally {
      rute.page404 = null
    }
  })

  QUnit.test('shows a network error when fetch fails', async assert => {
    globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'))
    let root
    const errors = await captureErrors(async () => {
      root = await go('about')
    })
    assert.strictEqual(root.innerHTML, '<h1>Network error</h1>')
    assert.strictEqual(errors.length, 1)
  })

  QUnit.test('runs scripts inside templates', async assert => {
    try {
      await go('script', '<script>globalThis.__ruteScriptRuns = (globalThis.__ruteScriptRuns || 0) + 1</script>')
      assert.strictEqual(globalThis.__ruteScriptRuns, 1)
    } finally {
      delete globalThis.__ruteScriptRuns
    }
  })

  QUnit.test('applies conversions to the template', async assert => {
    rute.conversions.shout = content => content.toUpperCase()
    try {
      const root = await go('about', '<p>quiet</p>')
      assert.strictEqual(root.textContent, 'QUIET')
    } finally {
      delete rute.conversions.shout
    }
  })
})

QUnit.module('data-bind', () => {
  const form = '<input data-bind="username" value="Ada"><span data-bind="username"></span>'

  QUnit.test('stores the initial value under a route-scoped key', async assert => {
    const root = await go('form', form)
    assert.strictEqual(localStorage.getItem('rute_hash_form_username'), '"Ada"')
    assert.strictEqual(root.querySelector('span').textContent, 'Ada')
  })

  QUnit.test('parses JSON values from the template', async assert => {
    await go('counter', '<h1 data-bind="count">0</h1><span hidden data-bind="todos">[]</span>')
    assert.strictEqual(globalThis.count, 0)
    assert.deepEqual(globalThis.todos, [])
  })

  QUnit.test('a stored value overrides the template', async assert => {
    localStorage.setItem('rute_hash_form_username', '"Grace"')
    const root = await go('form', form)
    assert.strictEqual(root.querySelector('input').value, 'Grace')
    assert.strictEqual(root.querySelector('span').textContent, 'Grace')
  })

  QUnit.test('setting the global updates elements and storage', async assert => {
    const root = await go('form', form)
    globalThis.username = 'Linus'
    assert.strictEqual(root.querySelector('input').value, 'Linus')
    assert.strictEqual(root.querySelector('span').textContent, 'Linus')
    assert.strictEqual(localStorage.getItem('rute_hash_form_username'), '"Linus"')
  })

  QUnit.test('typing in an input updates the global and other elements', async assert => {
    const root = await go('form', form)
    const input = root.querySelector('input')
    input.value = 'Margaret'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    assert.strictEqual(globalThis.username, 'Margaret')
    assert.strictEqual(root.querySelector('span').textContent, 'Margaret')
  })

  QUnit.test('the value survives navigating away and back', async assert => {
    await go('counter', '<h1 data-bind="count">0</h1>')
    globalThis.count++
    await go('other', '<p>Other</p>')
    const root = await go('counter')
    assert.strictEqual(globalThis.count, 1)
    assert.strictEqual(root.textContent, '1')
  })

  QUnit.test('each route has its own value', async assert => {
    await go('a', '<span data-bind="count">1</span>')
    globalThis.count = 5
    await go('b', '<span data-bind="count">2</span>')
    assert.strictEqual(globalThis.count, 2)
    await go('a')
    assert.strictEqual(globalThis.count, 5)
  })

  QUnit.test('globals are removed when the route changes', async assert => {
    await go('form', form)
    assert.true('username' in globalThis)
    await go('other', '<p>Other</p>')
    assert.false('username' in globalThis)
  })

  QUnit.test('setting undefined removes the stored value', async assert => {
    await go('form', form)
    globalThis.username = undefined
    assert.strictEqual(localStorage.getItem('rute_hash_form_username'), null)
  })

  QUnit.test('null is kept after reloading the route', async assert => {
    await go('form', form)
    globalThis.username = null
    await go('form')
    assert.strictEqual(globalThis.username, null)
    assert.strictEqual(localStorage.getItem('rute_hash_form_username'), 'null')
  })

  QUnit.test('does not overwrite an existing global', async assert => {
    globalThis.__ruteExisting = 'original'
    try {
      let root
      const errors = await captureErrors(async () => {
        root = await go('clash', '<input data-bind="__ruteExisting" value="x">')
      })
      assert.strictEqual(errors.length, 1)
      assert.strictEqual(globalThis.__ruteExisting, 'original')

      const input = root.querySelector('input')
      input.value = 'changed'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      assert.strictEqual(globalThis.__ruteExisting, 'original', 'input events are ignored')
    } finally {
      delete globalThis.__ruteExisting
    }
  })
})

QUnit.module('data-compute', () => {
  const total =
    '<input data-bind="price" value="10"><input data-bind="qty" value="2">' +
    '<span data-compute="total">price * qty</span>'

  QUnit.test('evaluates the expression on load', async assert => {
    const root = await go('total', total)
    assert.strictEqual(root.querySelector('span').textContent, '20')
  })

  QUnit.test('re-evaluates when a dependency is set', async assert => {
    const root = await go('total', total)
    globalThis.price = 5
    assert.strictEqual(root.querySelector('span').textContent, '10')
    globalThis.qty = 3
    assert.strictEqual(root.querySelector('span').textContent, '15')
  })

  QUnit.test('re-evaluates when a dependency is typed into', async assert => {
    const root = await go('total', total)
    const qty = root.querySelectorAll('input')[1]
    qty.value = '4'
    qty.dispatchEvent(new Event('input', { bubbles: true }))
    assert.strictEqual(root.querySelector('span').textContent, '40')
  })

  QUnit.test('works with array values', async assert => {
    const root = await go(
      'todo',
      '<span hidden data-bind="todos">[]</span>' +
        '<p data-compute="list">`Todos: ${todos.join(", ")}`</p>'
    )
    globalThis.todos = [...globalThis.todos, 'milk']
    globalThis.todos = [...globalThis.todos, 'eggs']
    assert.strictEqual(root.querySelector('p').textContent, 'Todos: milk, eggs')
  })

  QUnit.test('logs errors in expressions without breaking the page', async assert => {
    let root
    const errors = await captureErrors(async () => {
      root = await go('broken', '<p>Still here</p><span data-compute="bad">doesNotExist + 1</span>')
    })
    assert.strictEqual(errors.length, 1)
    assert.strictEqual(root.querySelector('p').textContent, 'Still here')
    assert.strictEqual(rute._tmpElement, null, 'tracking element is restored')
  })
})

QUnit.module('storage', () => {
  QUnit.test('clear removes only rute keys', assert => {
    localStorage.setItem('rute_hash_x_y', '1')
    localStorage.setItem('__not_rute', '1')
    try {
      rute.clear()
      assert.strictEqual(localStorage.getItem('rute_hash_x_y'), null)
      assert.strictEqual(localStorage.getItem('__not_rute'), '1')
    } finally {
      localStorage.removeItem('__not_rute')
    }
  })
})
