// Runtime checks for Raw and the cloud-safe types. The compile-time half (Raw does not
// type-check as CloudSafe) is in RoutingProof/ and runs with `make routing-proof`.

import Foundation
import Testing
@testable import SilhouetteCore

private let secret = "Zyxwanda 9917734"

private struct Holder {
    let label: String
    let raw: Raw<String>
}

@Suite("Raw and CloudSafe")
struct DataTypeTests {
    @Test("Raw does not reveal its value through printing, interpolation, dump or Mirror")
    func rawIsOpaque() {
        let raw = Raw(secret)
        let json = Raw(JSON.object(JSONObject([("name", .string(secret))])))
        let profile = Raw(ExactProfile(jurisdiction: "zz-test", county: secret))
        var dumped = ""
        dump(raw, to: &dumped)
        dump(Holder(label: "x", raw: raw), to: &dumped)
        dump([json], to: &dumped)
        let outputs = [
            String(describing: raw), String(reflecting: raw), "\(raw)", "\([raw])", "\(Optional(raw) as Any)",
            String(describing: Holder(label: "x", raw: raw)), String(reflecting: Holder(label: "x", raw: raw)),
            String(describing: json), String(describing: profile), dumped,
        ]
        for out in outputs {
            #expect(!out.contains("Zyxwanda"), "leaked through: \(out)")
            #expect(!out.contains("9917734"), "leaked through: \(out)")
        }
        #expect(Mirror(reflecting: raw).children.isEmpty)
        #expect(String(describing: raw) == "[Raw]")
    }

    @Test("deterministic code inside the package can still read and map the value")
    func packageAccess() {
        let raw = Raw(secret)
        #expect(raw.value == secret)
        #expect(raw.map(\.count).value == secret.count)
    }

    @Test("cloud-safe values expose exactly their silhouette text")
    func cloudText() throws {
        let result = Skeletonizer.skeletonize(Raw("Net Pay 1,000.00 Zyxwanda"), allowlist: try Shared.allowlist("en"))
        #expect(CloudBoundary.outbound(result.skeleton).text == "Net Pay \u{27E6}N1\u{27E7} \u{27E6}W1\u{27E7}")
        let bands = try Bands(json: Shared.json("bands/zz-test.json"))
        let profile = try Generalizer.generalize(Raw(ExactProfile(jurisdiction: "zz-test", annualIncome: 30524.9, householdSize: 3,
                                                                  childAges: [4, 9], county: "testshire", housing: "renter")), bands: bands)
        let payload = CloudBoundary.outbound(profile).text
        #expect(payload == #"{"jurisdiction":"zz-test","incomeBand":"C","householdSize":3,"childAgeBands":["0-5","6-17"],"county":"testshire","housing":"renter"}"#)
        #expect(!payload.contains("30524"))
        #expect(CloudBoundary.outbound(Public("Test Food Help")).text == "Test Food Help")
    }

    @Test("typed and JSON generalizer inputs agree")
    func typedProfile() throws {
        let bands = try Bands(json: Shared.json("bands/zz-test.json"))
        let typed = try Generalizer.generalize(Raw(ExactProfile(jurisdiction: "zz-test", incomeBand: "B", county: "test-shire-2")), bands: bands)
        #expect(typed.canonical == #"{"jurisdiction":"zz-test","incomeBand":"B","householdSize":null,"childAgeBands":null,"county":"test-shire-2","housing":null}"#)
        #expect(throws: GeneralizeError.self) {
            try Generalizer.generalize(Raw(ExactProfile(jurisdiction: "zz-test", householdSize: 0)), bands: bands)
        }
    }
}
