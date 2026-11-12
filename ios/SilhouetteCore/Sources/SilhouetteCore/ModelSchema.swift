// Model schema derivation: the deterministic conversion from a pointer schema
// (shared/schemas/pointer.*.json) to the schema a model API accepts. Contract:
// shared/schemas/MODEL_SCHEMA.md. Must produce the same object as
// shared/reference/model-schema.mjs, key order included.

import Foundation

public struct ModelSchemaError: Error, Sendable, CustomStringConvertible {
    public let description: String
    init(_ description: String) { self.description = description }
}

public enum ModelSchema {
    public enum Dialect: String, Sendable {
        /// `nullable: true`
        case openapi
        /// `type: [t, "null"]`, `anyOf: [..., {type: null}]`, `enum: [..., null]`
        case jsonschema
    }

    static let dropped: Set<String> = ["$id", "$schema", "$comment", "$defs", "x-kind", "additionalProperties", "pattern"]

    /// - Parameter requiredNullable: make every top-level property required and nullable.
    public static func derive(_ schema: JSON, requiredNullable: Bool = false, dialect: Dialect = .openapi) throws(ModelSchemaError) -> JSON {
        var out = try convert(schema, root: schema, depth: 0)
        guard requiredNullable else { return out }
        guard case .object(var top) = out, case .object(let props)? = top["properties"] else {
            throw ModelSchemaError("a schema without properties cannot be made required and nullable")
        }
        var nullable = JSONObject()
        for (key, value) in props.entries {
            nullable[key] = dialect == .openapi ? spread(value, [("nullable", .bool(true))]) : nullableJSONSchema(value)
        }
        top["properties"] = .object(nullable)
        top["required"] = .array(props.keys.map(JSON.string))
        out = .object(top)
        return out
    }

    /// `{ ...node, ...extra }`: existing keys keep their position and take the new value.
    private static func spread(_ node: JSON, _ extra: [(String, JSON)]) -> JSON {
        var o = asObject(node)
        for (k, v) in extra { o[k] = v }
        return .object(o)
    }

    /// The own enumerable properties of a value, as JavaScript's object spread sees them.
    private static func asObject(_ node: JSON) -> JSONObject {
        switch node {
        case .object(let o): return o
        case .array(let items): return JSONObject(items.enumerated().map { (String($0.offset), $0.element) })
        default: return JSONObject()
        }
    }

    private static func nullableJSONSchema(_ prop: JSON) -> JSON {
        if case .array(let anyOf)? = prop["anyOf"] {
            return spread(prop, [("anyOf", .array(anyOf + [.object(JSONObject([("type", .string("null"))]))]))])
        }
        var extra: [(String, JSON)] = [("type", .array([prop["type"] ?? .null, .string("null")]))]
        if case .array(let values)? = prop["enum"] { extra.append(("enum", .array(values + [.null]))) }
        return spread(prop, extra)
    }

    private static func resolve(_ root: JSON, _ ref: String) throws(ModelSchemaError) -> JSON {
        guard ref.hasPrefix("#/") else { throw ModelSchemaError("unsupported $ref") }
        var node: JSON? = root
        for part in String(ref.dropFirst(2)).splitExactly(on: UInt8(ascii: "/")) {
            switch node {
            case .object(let o)?: node = o[part]
            case .array(let items)?:
                if let i = Int(part), String(i) == part, i >= 0, i < items.count { node = items[i] } else { node = nil }
            default: node = nil
            }
        }
        switch node {
        case .object?, .array?: return node!
        default: throw ModelSchemaError("unresolved $ref")
        }
    }

    private static func convert(_ node: JSON, root: JSON, depth: Int) throws(ModelSchemaError) -> JSON {
        if depth > 32 { throw ModelSchemaError("schema too deep or recursive") }
        switch node {
        case .array(let items):
            var out: [JSON] = []
            for item in items { out.append(try convert(item, root: root, depth: depth + 1)) }
            return .array(out)
        case .object(let object):
            if case .string(let ref)? = object["$ref"] {
                var merged = asObject(try resolve(root, ref))
                for (k, v) in object.entries where !k.exactlyEquals("$ref") { merged[k] = v }
                return try convert(.object(merged), root: root, depth: depth + 1)
            }
            var out = JSONObject()
            for (key, value) in object.entries {
                if dropped.contains(where: { $0.exactlyEquals(key) }) { continue }
                let target = key.exactlyEquals("oneOf") ? "anyOf" : key
                if key.exactlyEquals("properties") {
                    var props = JSONObject()
                    for (k, v) in asObject(value).entries { props[k] = try convert(v, root: root, depth: depth + 1) }
                    out[target] = .object(props)
                } else {
                    out[target] = try convert(value, root: root, depth: depth + 1)
                }
            }
            if case .array? = out["enum"], out["type"] == nil { out["type"] = .string("string") }
            return .object(out)
        default:
            return node
        }
    }
}
