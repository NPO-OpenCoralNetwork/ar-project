// OSM API / Overpass の XML（version 0.6）を読む最小のパーサー。依存なし。
// node / way / relation と、その中の tag / nd / member だけを読む。

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return String.fromCodePoint(code)
    }
    return ENTITIES[e] ?? m
  })
}

function attrs(s) {
  /** @type {Record<string,string>} */
  const out = {}
  for (const m of s.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = decode(m[2])
  return out
}

/**
 * @typedef {{ id:number, lat:number, lon:number, tags:Record<string,string> }} OsmNode
 * @typedef {{ id:number, nodes:number[], tags:Record<string,string> }} OsmWay
 * @typedef {{ id:number, members:{type:string, ref:number, role:string}[], tags:Record<string,string> }} OsmRelation
 * @typedef {{ nodes:Map<number,OsmNode>, ways:Map<number,OsmWay>, relations:Map<number,OsmRelation> }} OsmData
 */

/** @returns {OsmData} */
export function emptyOsm() {
  return { nodes: new Map(), ways: new Map(), relations: new Map() }
}

/**
 * XML を読み、data に足す（同じ id は上書き）。
 * @param {string} xml
 * @param {OsmData} [data]
 */
export function parseOsmXml(xml, data = emptyOsm()) {
  const re = /<(node|way|relation)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g
  for (const m of xml.matchAll(re)) {
    const kind = m[1]
    const a = attrs(m[2])
    const body = m[4] ?? ''
    /** @type {Record<string,string>} */
    const tags = {}
    for (const t of body.matchAll(/<tag\b([^>]*?)\/>/g)) {
      const ta = attrs(t[1])
      if (ta.k !== undefined) tags[ta.k] = ta.v ?? ''
    }
    const id = Number(a.id)
    if (kind === 'node') {
      data.nodes.set(id, { id, lat: Number(a.lat), lon: Number(a.lon), tags })
    } else if (kind === 'way') {
      const nodes = [...body.matchAll(/<nd\b[^>]*?ref="(\d+)"/g)].map((n) => Number(n[1]))
      data.ways.set(id, { id, nodes, tags })
    } else {
      const members = [...body.matchAll(/<member\b([^>]*?)\/>/g)].map((mm) => {
        const ma = attrs(mm[1])
        return { type: ma.type, ref: Number(ma.ref), role: ma.role ?? '' }
      })
      data.relations.set(id, { id, members, tags })
    }
  }
  return data
}
