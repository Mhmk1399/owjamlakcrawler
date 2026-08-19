const FEATURE_VERSION = "sale-ppm-v1";
const FEATURE_COUNT = 7;

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function matrixVector(matrix, vector) {
  return matrix.map((row) => dot(row, vector));
}

function initialModel() {
  return {
    featureVersion: FEATURE_VERSION,
    count: 0,
    weights: Array(FEATURE_COUNT).fill(0),
    covariance: Array.from({ length: FEATURE_COUNT }, (_, row) =>
      Array.from({ length: FEATURE_COUNT }, (_, column) => (row === column ? 100 : 0)),
    ),
    residualMean: 0,
    residualM2: 0,
    updatedAt: null,
  };
}

export function saleFeatures(listing) {
  const area = listing.property?.area;
  if (!Number.isFinite(area) || area <= 0) return null;
  const amenities = ["elevator", "parking", "storage", "balcony"]
    .filter((key) => listing.amenities?.[key] === true).length;
  return [
    1,
    Math.log(area),
    Number.isFinite(listing.property?.rooms) ? listing.property.rooms / 5 : 0,
    Number.isFinite(listing.property?.constructionYear)
      ? (listing.property.constructionYear - 1_300) / 150
      : 0,
    Number.isFinite(listing.property?.floor) ? listing.property.floor / 20 : 0,
    amenities / 4,
    Number.isFinite(listing.property?.totalFloors)
      ? listing.property.totalFloors / 20
      : 0,
  ];
}

export class OnlineRidgeModel {
  constructor(state = null) {
    this.state = state?.featureVersion === FEATURE_VERSION ? state : initialModel();
  }

  update(features, target) {
    if (!features || features.length !== FEATURE_COUNT || !Number.isFinite(target)) return false;
    const model = this.state;
    const px = matrixVector(model.covariance, features);
    const denominator = 1 + dot(features, px);
    const gain = px.map((value) => value / denominator);
    const prediction = dot(model.weights, features);
    const error = target - prediction;

    model.weights = model.weights.map((weight, index) => weight + gain[index] * error);
    const featureTimesCovariance = Array.from(
      { length: FEATURE_COUNT },
      (_, column) => features.reduce(
        (sum, value, row) => sum + value * model.covariance[row][column],
        0,
      ),
    );
    model.covariance = model.covariance.map((row, rowIndex) =>
      row.map((value, columnIndex) => value - gain[rowIndex] * featureTimesCovariance[columnIndex]),
    );

    model.count += 1;
    const residualDelta = error - model.residualMean;
    model.residualMean += residualDelta / model.count;
    model.residualM2 += residualDelta * (error - model.residualMean);
    model.updatedAt = new Date().toISOString();
    return true;
  }

  predict(features) {
    if (!features || features.length !== FEATURE_COUNT || this.state.count === 0) return null;
    const logValue = dot(this.state.weights, features);
    if (!Number.isFinite(logValue)) return null;
    const standardDeviation = this.state.count > 1
      ? Math.sqrt(Math.max(0, this.state.residualM2 / (this.state.count - 1)))
      : null;
    return {
      value: Math.exp(logValue),
      logValue,
      standardDeviation,
    };
  }

  toJSON() {
    return this.state;
  }
}

export const onlineModelConstants = { FEATURE_VERSION, FEATURE_COUNT };
