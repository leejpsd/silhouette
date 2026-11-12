// Validation and annualization of confirmed paystub values. Contract: shared/validation/SPEC.md.
// Must stay identical with shared/reference/validate.mjs. No clock, no time zones. Money is held
// as integer cents; ratios use exact integer arithmetic (Int128).

import Foundation

/// Malformed validation input. Messages never contain values.
public struct ValidationInputError: Error, Sendable, CustomStringConvertible {
    public let description: String
    init(_ description: String) { self.description = description }
}

public struct CivilDate: Sendable, Equatable {
    public let year: Int
    public let month: Int
    public let day: Int

    /// `YYYY-MM-DD`
    public var iso: String {
        func pad(_ n: Int, _ width: Int) -> String {
            let s = String(n)
            return String(repeating: "0", count: max(0, width - s.count)) + s
        }
        return "\(pad(year, 4))-\(pad(month, 2))-\(pad(day, 2))"
    }

    /// Days since 1970-01-01, proleptic Gregorian.
    public var dayNumber: Int {
        func floorDiv(_ a: Int, _ b: Int) -> Int { Int((Double(a) / Double(b)).rounded(.down)) }
        let y = month <= 2 ? year - 1 : year
        let era = floorDiv(y, 400)
        let yoe = y - era * 400
        let mp = (month + 9) % 12
        let doy = (153 * mp + 2) / 5 + day - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097 + doe - 719_468
    }
}

public enum PayFrequency: String, Sendable, CaseIterable {
    case weekly, biweekly, semimonthly, monthly

    public var periodsPerYear: Int {
        switch self {
        case .weekly: 52
        case .biweekly: 26
        case .semimonthly: 24
        case .monthly: 12
        }
    }

    var periodDays: ClosedRange<Int> {
        switch self {
        case .weekly: 7...7
        case .biweekly: 14...14
        case .semimonthly: 13...16
        case .monthly: 28...31
        }
    }

    /// Section 4: the frequency a period length implies, if any.
    static func forLength(_ days: Int) -> PayFrequency? {
        switch days {
        case 7: .weekly
        case 14: .biweekly
        case 13...16: .semimonthly
        case 28...31: .monthly
        default: nil
        }
    }
}

public struct ValidationResult: Sendable {
    public enum Status: String, Sendable { case ok, warn, skipped }

    public struct Check: Sendable {
        public let id: String
        public let status: Status
    }

    public struct Annualization: Sendable {
        public enum Basis: Sendable {
            case ytd(ytdCents: Int, referenceDate: String, elapsedNumerator: Int, elapsedDenominator: Int, stubsUsed: [Int])
            case average(averageGrossCents: Int, periodsPerYear: Int, frequency: PayFrequency, stubsUsed: [Int])
        }

        /// Whole currency units per year.
        public let annualIncome: Int
        public let basis: Basis
        public var method: String { if case .ytd = basis { "ytd" } else { "average" } }
    }

    public let checks: [[Check]]
    public let duplicates: [Int]
    /// `no-gross` or `no-frequency`
    public let failure: String?
    public let annualization: Annualization?

    /// The result as JSON, keys in the reference order.
    public var json: JSON {
        let checksJSON = JSON.array(checks.map { stub in
            .array(stub.map { .object(JSONObject([("id", .string($0.id)), ("status", .string($0.status.rawValue))])) })
        })
        var annual: JSON = .null
        if let a = annualization {
            let ints: ([Int]) -> JSON = { .array($0.map { .number(Double($0)) }) }
            let basis: JSON = switch a.basis {
            case .ytd(let cents, let date, let num, let den, let used):
                .object(JSONObject([
                    ("ytdCents", .number(Double(cents))), ("referenceDate", .string(date)),
                    ("elapsedMonths", .object(JSONObject([("numerator", .number(Double(num))), ("denominator", .number(Double(den)))]))),
                    ("stubsUsed", ints(used)),
                ]))
            case .average(let avg, let periods, let frequency, let used):
                .object(JSONObject([
                    ("averageGrossCents", .number(Double(avg))), ("periodsPerYear", .number(Double(periods))),
                    ("frequency", .string(frequency.rawValue)), ("stubsUsed", ints(used)),
                ]))
            }
            annual = .object(JSONObject([("annualIncome", .number(Double(a.annualIncome))), ("method", .string(a.method)), ("basis", basis)]))
        }
        return .object(JSONObject([
            ("checks", checksJSON),
            ("duplicates", .array(duplicates.map { .number(Double($0)) })),
            ("failure", failure.map(JSON.string) ?? .null),
            ("annualization", annual),
        ]))
    }
}

public enum Validator {
    /// Date component order per jurisdiction (section 3). A jurisdiction not listed parses only
    /// year-first dates.
    public static let dateOrder: [String: String] = ["us-ca": "MDY", "zz-test": "MDY", "kr": "YMD"]

    // MARK: Money

    /// Largest cents value handled exactly (Int128 products stay in range far beyond any income).
    static let maxCents: Double = 1e30

    static func cents(_ value: JSON?) throws(ValidationInputError) -> Int128? {
        guard let value else { return nil }
        guard case .number(let x) = value, x.isFinite, x >= 0 else {
            throw ValidationInputError("money values must be finite and non-negative")
        }
        let c = (x * 100).rounded(.toNearestOrAwayFromZero)
        guard c <= maxCents else { throw ValidationInputError("money value too large") }
        return Int128(c)
    }

    /// Exact non-negative num/den rounded to the nearest integer, halves up.
    static func roundRatio(_ num: Int128, _ den: Int128) -> Int128 { (2 * num + den) / (2 * den) }

    // MARK: Dates

    static func isLeap(_ y: Int) -> Bool { (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 }

    public static func daysInMonth(_ year: Int, _ month: Int) -> Int {
        guard (1...12).contains(month) else { return 0 }
        return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    }

    private static let dateText = try! NSRegularExpression(pattern: #"^([0-9]{1,4})[/.\-]([0-9]{1,2})[/.\-]([0-9]{1,4})\z"#)
    private static let monthFirst = try! NSRegularExpression(
        pattern: "^(\(Skeletonizer.monthAlternation))\\.? ([0-9]{1,2})\(ordinal)?,? ([0-9]{4})\\z")
    private static let dayFirst = try! NSRegularExpression(
        pattern: "^([0-9]{1,2})\(ordinal)? (?:\(Skeletonizer.asciiInsensitive("de")) )?(\(Skeletonizer.monthAlternation))\\.?,? "
            + "(?:\(Skeletonizer.asciiInsensitive("de"))\(Skeletonizer.asciiInsensitive("l"))? )?([0-9]{4})\\z")
    private static var ordinal: String {
        "(?:" + ["st", "nd", "rd", "th"].map(Skeletonizer.asciiInsensitive).joined(separator: "|") + ")"
    }

    /// JavaScript `String.prototype.trim` whitespace.
    static func jsTrim(_ s: String) -> String {
        func isSpace(_ u: Unicode.Scalar) -> Bool {
            switch u.value {
            case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: true
            default: false
            }
        }
        var scalars = Array(s.unicodeScalars)
        while let f = scalars.first, isSpace(f) { scalars.removeFirst() }
        while let l = scalars.last, isSpace(l) { scalars.removeLast() }
        return String(String.UnicodeScalarView(scalars))
    }

    private static func groups(_ regex: NSRegularExpression, _ text: String) -> [String]? {
        let ns = text as NSString
        guard let m = regex.firstMatch(in: text, range: NSRange(location: 0, length: ns.length)) else { return nil }
        return (1..<m.numberOfRanges).map { ns.substring(with: m.range(at: $0)) }
    }

    private static func monthNumber(_ word: String) -> Int {
        let lower = word.lowercased()
        return (Skeletonizer.monthNames.firstIndex { $0.contains(lower) } ?? -1) + 1
    }

    /// `.some(date)`, `.some(nil)` (a month-name date that is invalid) or `nil` (not one).
    private static func parseMonthNameDate(_ text: String) -> CivilDate?? {
        var parts: (y: Int, m: Int, d: Int)?
        if let g = groups(monthFirst, text) { parts = (Int(g[2])!, monthNumber(g[0]), Int(g[1])!) }
        else if let g = groups(dayFirst, text) { parts = (Int(g[2])!, monthNumber(g[1]), Int(g[0])!) }
        guard let p = parts else { return nil }
        if p.y < 1900 || p.y > 2099 || p.d < 1 || p.d > daysInMonth(p.y, p.m) { return .some(nil) }
        return .some(CivilDate(year: p.y, month: p.m, day: p.d))
    }

    /// Section 3. `nil` when the text does not parse.
    public static func parseDate(_ text: String, jurisdiction: String) -> CivilDate? {
        let trimmed = jsTrim(text)
        if let named = parseMonthNameDate(trimmed) { return named }
        guard let g = groups(dateText, trimmed) else { return nil }
        let (a, b, c) = (g[0], g[1], g[2])
        guard let order = a.count == 4 ? "YMD" : dateOrder.first(where: { $0.key.exactlyEquals(jurisdiction) })?.value else { return nil }
        let (ys, ms, ds) = order == "YMD" ? (a, b, c) : order == "MDY" ? (c, a, b) : (c, b, a)
        guard ds.count <= 2, ms.count <= 2 else { return nil }
        let year: Int
        if ys.count == 4 { year = Int(ys)! } else if ys.count == 2 { year = 2000 + Int(ys)! } else { return nil }
        let month = Int(ms)!, day = Int(ds)!
        guard (1900...2099).contains(year), (1...12).contains(month), day >= 1, day <= daysInMonth(year, month) else { return nil }
        return CivilDate(year: year, month: month, day: day)
    }

    // MARK: Paystubs

    private struct Stub {
        let index: Int
        let gross: Int128?, net: Int128?, ytd: Int128?, rate: Int128?
        let hoursHundredths: Int128?
        let deductions: [Int128]
        let frequency: PayFrequency?
        let frequencyInferred: Bool
        let payDate: CivilDate?, periodStart: CivilDate?, periodEnd: CivilDate?
        var referenceDate: CivilDate? { periodEnd ?? payDate }
    }

    private static func normalize(_ values: JSON, index: Int, jurisdiction: String) throws(ValidationInputError) -> Stub {
        guard case .object(let v) = values else { throw ValidationInputError("a paystub must be an object") }
        var frequency: PayFrequency?
        if let f = v["payFrequency"] {
            guard case .string(let s) = f, let known = PayFrequency.allCases.first(where: { $0.rawValue.exactlyEquals(s) }) else {
                throw ValidationInputError("unknown pay frequency")
            }
            frequency = known
        }
        var hours: Int128?
        if let h = v["hoursWorked"] {
            guard case .number(let x) = h, x.isFinite, x >= 0 else { throw ValidationInputError("hours must be finite and non-negative") }
            let c = (x * 100).rounded(.toNearestOrAwayFromZero)
            guard c <= maxCents else { throw ValidationInputError("hours value too large") }
            hours = Int128(c)
        }
        func date(_ key: String) throws(ValidationInputError) -> CivilDate? {
            guard let t = v[key] else { return nil }
            guard case .string(let s) = t else { throw ValidationInputError("dates must be text") }
            return parseDate(s, jurisdiction: jurisdiction)
        }
        let periodStart = try date("periodStart"), periodEnd = try date("periodEnd")
        var inferred = false
        if frequency == nil, let s = periodStart, let e = periodEnd {
            frequency = PayFrequency.forLength(e.dayNumber - s.dayNumber + 1)
            inferred = frequency != nil
        }
        var deductions: [Int128] = []
        if let d = v["deductions"], !d.isNull {
            guard case .array(let items) = d else { throw ValidationInputError("deductions must be a list") }
            for item in items {
                guard case .object(let o) = item, let amount = try cents(o["amount"]) else {
                    throw ValidationInputError("a deduction needs an amount")
                }
                deductions.append(amount)
            }
        }
        return Stub(index: index, gross: try cents(v["grossPay"]), net: try cents(v["netPay"]), ytd: try cents(v["ytdGross"]),
                    rate: try cents(v["hourlyRate"]), hoursHundredths: hours, deductions: deductions,
                    frequency: frequency, frequencyInferred: inferred,
                    payDate: try date("payDate"), periodStart: periodStart, periodEnd: periodEnd)
    }

    /// E = ((m − 1)·D + d) / D
    private static func elapsedMonths(_ d: CivilDate) -> (num: Int128, den: Int128) {
        let D = daysInMonth(d.year, d.month)
        return (Int128((d.month - 1) * D + d.day), Int128(D))
    }

    private static func checks(_ s: Stub, raw: JSONObject) -> [ValidationResult.Check] {
        var out: [ValidationResult.Check] = []
        func add(_ id: String, _ status: ValidationResult.Status) { out.append(.init(id: id, status: status)) }

        if let gross = s.gross, let net = s.net {
            let diff = abs(gross - s.deductions.reduce(0, +) - net)
            add("net-sum", diff * 100 <= gross ? .ok : .warn)
        } else { add("net-sum", .skipped) }

        if let rate = s.rate, let hours = s.hoursHundredths, let gross = s.gross {
            let diff = abs(rate * hours - gross * 100)
            add("rate-hours", diff * 100 <= gross * 100 ? .ok : .warn)
        } else { add("rate-hours", .skipped) }

        if let start = s.periodStart, let end = s.periodEnd {
            let length = end.dayNumber - start.dayNumber + 1
            if length < 1 { add("period-length", .warn) }
            else if s.frequency == nil || s.frequencyInferred { add("period-length", s.frequency == nil ? .warn : .ok) }
            else { add("period-length", s.frequency!.periodDays.contains(length) ? .ok : .warn) }
        } else { add("period-length", .skipped) }

        if let pay = s.payDate, let end = s.periodEnd { add("pay-date", abs(pay.dayNumber - end.dayNumber) <= 31 ? .ok : .warn) }
        else { add("pay-date", .skipped) }

        if let ytd = s.ytd, let gross = s.gross { add("ytd-gross", ytd >= gross ? .ok : .warn) }
        else { add("ytd-gross", .skipped) }

        if let ytd = s.ytd, let gross = s.gross, gross > 0, let f = s.frequency, let ref = s.referenceDate {
            let e = elapsedMonths(ref)
            let p = Int128(f.periodsPerYear)
            let n = (p * e.num + 12 * e.den - 1) / (12 * e.den)
            let ytd2 = 2 * ytd
            add("ytd-periods", ytd2 >= n * gross && ytd2 <= 3 * n * gross ? .ok : .warn)
        } else { add("ytd-periods", .skipped) }

        let given = [("payDate", s.payDate), ("periodStart", s.periodStart), ("periodEnd", s.periodEnd)].filter { raw.has($0.0) }
        add("dates-parsed", given.isEmpty ? .skipped : given.allSatisfy { $0.1 != nil } ? .ok : .warn)
        return out
    }

    /// Section 5–7: checks per paystub, duplicates, and the annual income.
    public static func validatePaystubs(_ rawValues: Raw<[JSON]>, jurisdiction: String) throws(ValidationInputError) -> ValidationResult {
        let values = rawValues.value
        var stubs: [Stub] = []
        for (i, v) in values.enumerated() { stubs.append(try normalize(v, index: i, jurisdiction: jurisdiction)) }
        let allChecks = zip(stubs, values).map { checks($0, raw: $1.objectValue ?? JSONObject()) }

        var seen = Set<String>()
        var duplicates: [Int] = []
        var unique: [Stub] = []
        for s in stubs {
            let key = [s.periodStart, s.periodEnd, s.payDate].map { $0?.iso ?? "-" }.joined(separator: "|") + "|" + (s.gross.map { String($0) } ?? "-")
            if seen.contains(key) { duplicates.append(s.index); continue }
            seen.insert(key)
            unique.append(s)
        }

        var reference: Stub?
        for s in unique {
            guard let day = s.referenceDate?.dayNumber else { continue }
            if reference == nil || day >= reference!.referenceDate!.dayNumber { reference = s }
        }

        if let r = reference, let ytd = r.ytd, ytd > 0, let refDate = r.referenceDate {
            let e = elapsedMonths(refDate)
            if e.num >= e.den {
                let annual = roundRatio(ytd * 12 * e.den, 100 * e.num)
                return ValidationResult(checks: allChecks, duplicates: duplicates, failure: nil, annualization: .init(
                    annualIncome: Int(annual),
                    basis: .ytd(ytdCents: Int(ytd), referenceDate: refDate.iso, elapsedNumerator: Int(e.num),
                                elapsedDenominator: Int(e.den), stubsUsed: [r.index])))
            }
        }

        let withGross = unique.filter { $0.gross != nil }
        if withGross.isEmpty { return ValidationResult(checks: allChecks, duplicates: duplicates, failure: "no-gross", annualization: nil) }
        var latest: Stub?
        for s in withGross {
            guard let day = s.referenceDate?.dayNumber else { continue }
            if latest == nil || day >= latest!.referenceDate!.dayNumber { latest = s }
        }
        guard let frequency = latest?.frequency ?? withGross.first(where: { $0.frequency != nil })?.frequency else {
            return ValidationResult(checks: allChecks, duplicates: duplicates, failure: "no-frequency", annualization: nil)
        }
        let used = withGross.filter { $0.frequency == frequency || $0.frequency == nil }
        let total = used.reduce(Int128(0)) { $0 + $1.gross! }
        let count = Int128(used.count)
        let periods = frequency.periodsPerYear
        return ValidationResult(checks: allChecks, duplicates: duplicates, failure: nil, annualization: .init(
            annualIncome: Int(roundRatio(total * Int128(periods), 100 * count)),
            basis: .average(averageGrossCents: Int(roundRatio(total, count)), periodsPerYear: periods, frequency: frequency,
                            stubsUsed: used.map(\.index))))
    }
}
