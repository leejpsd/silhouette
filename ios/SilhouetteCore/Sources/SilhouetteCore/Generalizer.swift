// Generalizer. Contract: shared/rulepacks/SPEC.md section 6 and
// shared/schemas/generalized-profile.json. Must stay identical with shared/reference/silhouette.mjs.

import Foundation

// MARK: - Bands

/// shared/bands/{jurisdiction}.json
public struct Bands: Sendable {
    public struct IncomeBand: Sendable {
        public let id: String
        public let min: Double
        /// `nil` for the open-ended top band.
        public let max: Double?
    }

    public struct AgeBand: Sendable {
        public let id: String
        public let min: Double
        public let max: Double
    }

    public let jurisdiction: String
    public let annualIncome: [IncomeBand]
    public let householdSizeCap: Double
    public let childAgeBands: [AgeBand]

    public init(json: JSON) throws(ContractFileError) {
        guard let jurisdiction = json["jurisdiction"]?.stringValue,
              let income = json["annualIncome"]?.arrayValue,
              let cap = json["householdSizeCap"]?.numberValue,
              let ages = json["childAgeBands"]?.arrayValue
        else { throw ContractFileError("bands file is missing jurisdiction, annualIncome, householdSizeCap or childAgeBands") }
        var incomeBands: [IncomeBand] = []
        for band in income {
            guard let id = band["id"]?.stringValue, let min = band["min"]?.numberValue, let max = band["max"],
                  max.isNull || max.numberValue != nil
            else { throw ContractFileError("malformed income band") }
            incomeBands.append(IncomeBand(id: id, min: min, max: max.numberValue))
        }
        var ageBands: [AgeBand] = []
        for band in ages {
            guard let id = band["id"]?.stringValue, let min = band["min"]?.numberValue, let max = band["max"]?.numberValue
            else { throw ContractFileError("malformed child age band") }
            ageBands.append(AgeBand(id: id, min: min, max: max))
        }
        self.jurisdiction = jurisdiction
        self.annualIncome = incomeBands
        self.householdSizeCap = cap
        self.childAgeBands = ageBands
    }

    func band(id: String) -> IncomeBand? {
        annualIncome.first { $0.id.exactlyEquals(id) }
    }

    func band(containing income: Double) -> IncomeBand? {
        let value = Swift.max(income, 0).rounded(.down)
        return annualIncome.first { value >= $0.min && ($0.max == nil || value <= $0.max!) }
    }
}

// MARK: - Profiles

/// The exact profile. Always handled as `Raw`. `nil` means unanswered.
public struct ExactProfile: Sendable {
    public var jurisdiction: String
    public var annualIncome: Double?
    public var incomeBand: String?
    public var householdSize: Int?
    public var childAges: [Double]?
    public var county: String?
    public var housing: String?

    public init(jurisdiction: String, annualIncome: Double? = nil, incomeBand: String? = nil, householdSize: Int? = nil,
                childAges: [Double]? = nil, county: String? = nil, housing: String? = nil) {
        self.jurisdiction = jurisdiction
        self.annualIncome = annualIncome
        self.incomeBand = incomeBand
        self.householdSize = householdSize
        self.childAges = childAges
        self.county = county
        self.housing = housing
    }

    var json: JSON {
        var o = JSONObject()
        o["jurisdiction"] = .string(jurisdiction)
        if let annualIncome { o["annualIncome"] = .number(annualIncome) }
        if let incomeBand { o["incomeBand"] = .string(incomeBand) }
        if let householdSize { o["householdSize"] = .number(Double(householdSize)) }
        if let childAges { o["childAges"] = .array(childAges.map(JSON.number)) }
        if let county { o["county"] = .string(county) }
        if let housing { o["housing"] = .string(housing) }
        return .object(o)
    }
}

/// The profile silhouette (schemas/generalized-profile.json). `nil` means unanswered.
public struct GeneralizedProfile: Sendable {
    public enum HouseholdSize: Sendable, Equatable {
        /// 1 … cap
        case exact(Int)
        /// `"{cap}+"`
        case capped(String)
    }

    public enum Housing: String, Sendable, CaseIterable {
        case renter, owner, other
    }

    public let jurisdiction: String
    public let incomeBand: String?
    public let householdSize: HouseholdSize?
    public let childAgeBands: [String]?
    public let county: String?
    public let housing: Housing?

    /// The profile as a JSON object, keys in schema order.
    public var json: JSON {
        func str(_ s: String?) -> JSON { s.map(JSON.string) ?? .null }
        let size: JSON = switch householdSize {
        case .exact(let n)?: .number(Double(n))
        case .capped(let s)?: .string(s)
        case nil: .null
        }
        return .object(JSONObject([
            ("jurisdiction", .string(jurisdiction)),
            ("incomeBand", str(incomeBand)),
            ("householdSize", size),
            ("childAgeBands", childAgeBands.map { .array($0.map(JSON.string)) } ?? .null),
            ("county", str(county)),
            ("housing", str(housing?.rawValue)),
        ]))
    }

    /// Canonical serialization: all six keys in schema order, no whitespace, `null` for
    /// unanswered fields, integers without a fraction. Written by hand (not JSONEncoder) so the
    /// key order, number format and escaping are fixed.
    public var canonical: String {
        var out = "{\"jurisdiction\":"
        JSON.writeString(jurisdiction, to: &out)
        out += ",\"incomeBand\":"
        if let incomeBand { JSON.writeString(incomeBand, to: &out) } else { out += "null" }
        out += ",\"householdSize\":"
        switch householdSize {
        case .exact(let n)?: out += String(n)
        case .capped(let s)?: JSON.writeString(s, to: &out)
        case nil: out += "null"
        }
        out += ",\"childAgeBands\":"
        if let childAgeBands {
            out += "["
            for (i, id) in childAgeBands.enumerated() {
                if i > 0 { out += "," }
                JSON.writeString(id, to: &out)
            }
            out += "]"
        } else {
            out += "null"
        }
        out += ",\"county\":"
        if let county { JSON.writeString(county, to: &out) } else { out += "null" }
        out += ",\"housing\":"
        if let housing { JSON.writeString(housing.rawValue, to: &out) } else { out += "null" }
        out += "}"
        return out
    }
}

/// A profile silhouette cannot be built. Messages never contain user values.
public struct GeneralizeError: Error, Sendable, CustomStringConvertible {
    public let description: String
    init(_ description: String) { self.description = description }
}

// MARK: - Generalizer

public enum Generalizer {
    // `\z`, not `$`: in ICU `$` also matches before a final line terminator, in JavaScript it does not.
    private static let slug = try! NSRegularExpression(pattern: #"^[a-z0-9]+(?:-[a-z0-9]+)*\z"#)

    static func isSlug(_ s: String) -> Bool {
        slug.firstMatch(in: s, range: NSRange(location: 0, length: (s as NSString).length)) != nil
    }

    private static func given(_ value: JSON?) -> JSON? {
        guard let value, !value.isNull else { return nil }
        return value
    }

    /// Turns the exact profile into the profile silhouette. One of the two functions allowed to
    /// produce a cloud-safe value from Raw. Unanswered fields become `nil`; invalid input throws.
    public static func generalize(_ exact: Raw<ExactProfile>, bands: Bands) throws(GeneralizeError) -> Generalized<GeneralizedProfile> {
        try generalize(json: exact.map(\.json), bands: bands)
    }

    /// The same, from a loosely typed profile object (as in the conformance fixtures), so that
    /// values of the wrong JSON type are rejected exactly like the reference does.
    public static func generalize(json rawExact: Raw<JSON>, bands: Bands) throws(GeneralizeError) -> Generalized<GeneralizedProfile> {
        let exact = rawExact.value
        guard case .string(let jurisdiction)? = exact["jurisdiction"], isSlug(jurisdiction) else {
            throw GeneralizeError("jurisdiction must be a slug")
        }

        var incomeBand: String?
        if let income = given(exact["annualIncome"]) {
            guard case .number(let value) = income, value.isFinite else { throw GeneralizeError("annualIncome must be a finite number") }
            guard let band = bands.band(containing: value) else { throw GeneralizeError("annualIncome is not covered by any band") }
            incomeBand = band.id
        } else if let chosen = given(exact["incomeBand"]) {
            guard case .string(let id) = chosen, let band = bands.band(id: id) else { throw GeneralizeError("unknown income band") }
            incomeBand = band.id
        }

        var householdSize: GeneralizedProfile.HouseholdSize?
        if let size = given(exact["householdSize"]) {
            guard case .number(let n) = size, n.isFinite, n.rounded(.towardZero) == n, n >= 1 else {
                throw GeneralizeError("householdSize must be a positive integer")
            }
            householdSize = n > bands.householdSizeCap ? .capped(JSNumber.string(bands.householdSizeCap) + "+") : .exact(Int(n))
        }

        var childAgeBands: [String]?
        if let agesValue = given(exact["childAges"]) {
            guard case .array(let items) = agesValue else { throw GeneralizeError("childAges must be a list of numbers") }
            var ages: [Double] = []
            for item in items {
                guard case .number(let age) = item, age.isFinite else { throw GeneralizeError("childAges must be a list of numbers") }
                ages.append(age)
            }
            childAgeBands = bands.childAgeBands.filter { band in ages.contains { $0 >= band.min && $0 <= band.max } }.map(\.id)
        }

        var county: String?
        if let value = given(exact["county"]) {
            guard case .string(let slug) = value, isSlug(slug) else { throw GeneralizeError("county must be a slug") }
            county = slug
        }

        var housing: GeneralizedProfile.Housing?
        if let value = given(exact["housing"]) {
            guard case .string(let s) = value,
                  let h = GeneralizedProfile.Housing.allCases.first(where: { $0.rawValue.exactlyEquals(s) })
            else { throw GeneralizeError("unknown housing value") }
            housing = h
        }

        let profile = GeneralizedProfile(jurisdiction: jurisdiction, incomeBand: incomeBand, householdSize: householdSize,
                                         childAgeBands: childAgeBands, county: county, housing: housing)
        return Generalized(value: profile, canonical: profile.canonical)
    }
}
