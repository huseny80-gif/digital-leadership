import { DEFAULT_CREW_CONFIG, validateCrewConfig, vpOccupancySeconds } from "../../src/domain/equipment";
import { buildReceiverStations, buildSourcePoints, DEMO_GEOMETRY, surveyBounds } from "../../src/domain/survey";

describe("equipment model", () => {
  it("computes VP occupancy from sweeps and listen time", () => {
    expect(vpOccupancySeconds({ sweepSeconds: 12, sweepsPerVp: 2, listenSeconds: 6, moveSpeedMps: 2 })).toBe(36);
  });

  it("rejects non-positive sweep parameters", () => {
    expect(() => vpOccupancySeconds({ sweepSeconds: 0, sweepsPerVp: 1, listenSeconds: 0, moveSpeedMps: 1 })).toThrow(RangeError);
  });

  it("validates crew configuration", () => {
    expect(validateCrewConfig(DEFAULT_CREW_CONFIG)).toEqual([]);
    const bad = validateCrewConfig({ ...DEFAULT_CREW_CONFIG, vibratorFleets: 0, dgpsDropoutRate: 2 });
    expect(bad).toEqual(expect.arrayContaining([expect.stringMatching(/vibratorFleets/), expect.stringMatching(/dgpsDropoutRate/)]));
  });
});

describe("survey geometry", () => {
  it("builds a unique, correctly sized source grid", () => {
    const pts = buildSourcePoints(DEMO_GEOMETRY);
    expect(pts).toHaveLength(DEMO_GEOMETRY.sourceLines * DEMO_GEOMETRY.pointsPerSourceLine);
    expect(new Set(pts.map((p) => p.id)).size).toBe(pts.length);
    expect(pts[0]).toMatchObject({ id: "S1001-P2001", position: { x: 0, y: 0 } });
  });

  it("builds receivers orthogonal to source lines", () => {
    const rs = buildReceiverStations(DEMO_GEOMETRY);
    expect(rs).toHaveLength(48);
    const line1 = rs.filter((r) => r.line === 5001);
    expect(new Set(line1.map((r) => r.position.x)).size).toBe(1);
  });

  it("rejects invalid geometry and computes bounds", () => {
    expect(() => buildSourcePoints({ ...DEMO_GEOMETRY, sourceLines: 0 })).toThrow(RangeError);
    expect(surveyBounds([])).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
    expect(surveyBounds([{ x: 1, y: 5 }, { x: -2, y: 3 }])).toEqual({ minX: -2, maxX: 1, minY: 3, maxY: 5 });
  });
});
