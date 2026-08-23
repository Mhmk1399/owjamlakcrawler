import {
  clamp,
  mean,
  median,
  medianAbsoluteDeviation,
} from "./statistics.js";

export const PRICE_MODEL_VERSION = "geo-hedonic-ridge-log-ppm-v2";

const SPATIAL_ANCHORS = [35.55, 35.7, 35.85].flatMap((latitude) => (
  [51.1, 51.3, 51.5, 51.7].map((longitude) => ({ latitude, longitude }))
));

const FEATURE_NAMES = [
  "logArea",
  "logAreaSquared",
  "areaAbove60",
  "areaAbove100",
  "rooms",
  "roomsSquared",
  "areaPerRoom",
  "buildingAge",
  "buildingAgeSquared",
  "isNewBuild",
  "floor",
  "totalFloors",
  "floorRatio",
  "isGroundFloor",
  "isBasement",
  "isTopFloor",
  "unitsPerFloor",
  "isSingleUnitFloor",
  "elevator",
  "parking",
  "storage",
  "balcony",
  "elevatorFloorInteraction",
  "parkingAreaInteraction",
  "latitude",
  "longitude",
  "latitudeSquared",
  "longitudeSquared",
  "latitudeLongitude",
  "approximateLocation",
  "missingRooms",
  "missingConstructionYear",
  "missingFloor",
  "missingTotalFloors",
  "missingUnitsPerFloor",
  "missingElevator",
  "missingParking",
  "missingStorage",
  "missingBalcony",
  ...SPATIAL_ANCHORS.map((_, index) => `spatialRbf${index + 1}`),
];

function featureVector(listing) {
  const latitude = listing.location.latitude;
  const longitude = listing.location.longitude;
  const logArea = Math.log(listing.property.area);
  const missing = listing.cleaning.missingIndicators;
  const spatial = SPATIAL_ANCHORS.map((anchor) => {
    const latitudeDistance = (latitude - anchor.latitude) / 0.075;
    const longitudeDistance = (longitude - anchor.longitude) / 0.09;
    return Math.exp(-0.5 * (latitudeDistance ** 2 + longitudeDistance ** 2));
  });
  return [
    logArea,
    logArea ** 2,
    Math.max(0, listing.property.area - 60),
    Math.max(0, listing.property.area - 100),
    listing.property.rooms,
    listing.property.rooms ** 2,
    listing.property.areaPerRoom,
    listing.property.buildingAge,
    listing.property.buildingAge ** 2,
    listing.property.isNewBuild ? 1 : 0,
    listing.property.floor,
    listing.property.totalFloors,
    listing.property.floorRatio,
    listing.property.isGroundFloor ? 1 : 0,
    listing.property.isBasement ? 1 : 0,
    listing.property.isTopFloor ? 1 : 0,
    listing.property.unitsPerFloor,
    listing.property.isSingleUnitFloor ? 1 : 0,
    listing.amenities.elevator,
    listing.amenities.parking,
    listing.amenities.storage,
    listing.amenities.balcony,
    listing.amenities.elevator * Math.max(0, listing.property.floor),
    listing.amenities.parking * logArea,
    latitude,
    longitude,
    latitude * latitude,
    longitude * longitude,
    latitude * longitude,
    listing.location.accuracy === "approximate" ? 1 : 0,
    missing.rooms ? 1 : 0,
    missing.constructionYear ? 1 : 0,
    missing.floor ? 1 : 0,
    missing.totalFloors ? 1 : 0,
    missing.unitsPerFloor ? 1 : 0,
    missing.elevator ? 1 : 0,
    missing.parking ? 1 : 0,
    missing.storage ? 1 : 0,
    missing.balcony ? 1 : 0,
    ...spatial,
  ];
}

function solveLinearSystem(matrix, values) {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) {
      throw new Error(`Pricing model matrix is singular at column ${column}`);
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

function train(records, lambda) {
  const raw = records.map(featureVector);
  const means = FEATURE_NAMES.map((_, index) => mean(raw.map((row) => row[index])));
  const deviations = FEATURE_NAMES.map((_, index) => {
    const variance = mean(raw.map((row) => (row[index] - means[index]) ** 2));
    return Math.sqrt(variance) || 1;
  });
  const rows = raw.map((row) => [
    1,
    ...row.map((value, index) => (value - means[index]) / deviations[index]),
  ]);
  const targets = records.map((listing) => Math.log(listing.pricing.askingPricePerMeter));
  const dimension = FEATURE_NAMES.length + 1;
  const gram = Array.from({ length: dimension }, () => Array(dimension).fill(0));
  const right = Array(dimension).fill(0);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    for (let left = 0; left < dimension; left += 1) {
      right[left] += row[left] * targets[rowIndex];
      for (let rightIndex = 0; rightIndex < dimension; rightIndex += 1) {
        gram[left][rightIndex] += row[left] * row[rightIndex];
      }
    }
  }
  for (let index = 1; index < dimension; index += 1) gram[index][index] += lambda;
  return {
    featureNames: FEATURE_NAMES,
    featureMeans: means,
    featureDeviations: deviations,
    coefficients: solveLinearSystem(gram, right),
    lambda,
    trainingCount: records.length,
  };
}

export function predictPricePerMeter(model, listing) {
  const features = featureVector(listing);
  const standardized = [
    1,
    ...features.map((value, index) => (
      (value - model.featureMeans[index]) / model.featureDeviations[index]
    )),
  ];
  const logPrediction = standardized.reduce(
    (sum, value, index) => sum + value * model.coefficients[index],
    0,
  );
  return Math.round(Math.exp(logPrediction));
}

function robustTrain(records, lambda) {
  const initial = train(records, lambda);
  const residuals = records.map((listing) => (
    Math.log(listing.pricing.askingPricePerMeter) -
    Math.log(predictPricePerMeter(initial, listing))
  ));
  const center = median(residuals);
  const scaledMad = medianAbsoluteDeviation(residuals) * 1.4826;
  const threshold = Math.max(0.35, scaledMad * 4);
  const kept = records.filter((_, index) => Math.abs(residuals[index] - center) <= threshold);
  const model = kept.length >= FEATURE_NAMES.length * 3 ? train(kept, lambda) : initial;
  return {
    ...model,
    initialTrainingCount: records.length,
    outlierCount: records.length - kept.length,
    residualOutlierThresholdLog: threshold,
  };
}

function tokenFold(token, foldCount) {
  let hash = 2_166_136_261;
  for (const character of token) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % foldCount;
}

function validationMetrics(records, predictions) {
  const actual = records.map((listing) => listing.pricing.askingPricePerMeter);
  const predicted = records.map((listing) => predictions.get(listing.token));
  const absoluteErrors = actual.map((value, index) => Math.abs(value - predicted[index]));
  const percentageErrors = actual.map((value, index) => absoluteErrors[index] / value * 100);
  const logActual = actual.map(Math.log);
  const logPredicted = predicted.map(Math.log);
  const logMean = mean(logActual);
  const squaredLogErrors = logActual.map((value, index) => (value - logPredicted[index]) ** 2);
  const totalLogVariance = logActual.reduce((sum, value) => sum + (value - logMean) ** 2, 0);
  const residualLogVariance = squaredLogErrors.reduce((sum, value) => sum + value, 0);
  return {
    method: "deterministic-five-fold-cross-validation",
    sampleCount: records.length,
    meanAbsoluteErrorPricePerMeter: Math.round(mean(absoluteErrors)),
    medianAbsolutePercentageError: Number(median(percentageErrors).toFixed(2)),
    meanAbsolutePercentageError: Number(mean(percentageErrors).toFixed(2)),
    rootMeanSquaredLogError: Number(Math.sqrt(mean(squaredLogErrors)).toFixed(4)),
    rSquaredLog: Number((totalLogVariance > 0
      ? 1 - residualLogVariance / totalLogVariance
      : 0).toFixed(4)),
    within20Percent: Number((percentageErrors.filter((value) => value <= 20).length / records.length * 100).toFixed(2)),
    within30Percent: Number((percentageErrors.filter((value) => value <= 30).length / records.length * 100).toFixed(2)),
    qualityScore: Math.round(clamp(100 - median(percentageErrors) * 1.5, 20, 90)),
  };
}

export function trainCrossValidatedPriceModel(
  records,
  { folds = 5, lambda = 10, onEvent = () => {} } = {},
) {
  if (records.length < 120) {
    throw new Error("At least 120 cleaned listings are required");
  }
  const foldCount = clamp(Math.round(folds), 3, 10);
  const predictions = new Map();
  for (let fold = 0; fold < foldCount; fold += 1) {
    const training = records.filter((listing) => tokenFold(listing.token, foldCount) !== fold);
    const validation = records.filter((listing) => tokenFold(listing.token, foldCount) === fold);
    const model = robustTrain(training, lambda);
    for (const listing of validation) {
      predictions.set(listing.token, predictPricePerMeter(model, listing));
    }
    onEvent({
      type: "model.fold.complete",
      fold: fold + 1,
      folds: foldCount,
      trainingCount: training.length,
      validationCount: validation.length,
      trainingOutliers: model.outlierCount,
    });
  }
  const finalModel = robustTrain(records, lambda);
  const validation = validationMetrics(records, predictions);
  return {
    predictions,
    model: {
      schemaVersion: "1.0.0",
      modelVersion: PRICE_MODEL_VERSION,
      target: "log-asking-price-per-square-meter",
      locationFeaturesIncluded: true,
      crossValidationFolds: foldCount,
      ...finalModel,
      validation,
    },
  };
}

export const ridgeHelpers = { featureVector, solveLinearSystem, tokenFold, robustTrain };
