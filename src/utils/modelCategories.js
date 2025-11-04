import trackedModels from '../../config/tracked-models.json';
import { getModelKey } from '../services/dataLoader';

const {
  categories: categoryConfig = {},
  defaultCategory
} = trackedModels;

export const CATEGORY_TABS = Object.entries(categoryConfig).map(
  ([id, info]) => ({
    id,
    label: info.label || id,
    description: info.description || ''
  })
);

export const DEFAULT_CATEGORY = (
  (defaultCategory && categoryConfig[defaultCategory])
    ? defaultCategory
    : CATEGORY_TABS[0]?.id
) || null;

const modelCategoryMap = new Map();

Object.entries(categoryConfig).forEach(([categoryId, info]) => {
  const models = Array.isArray(info.models) ? info.models : [];

  models.forEach(modelEntry => {
    const modelKey = typeof modelEntry === 'string'
      ? modelEntry
      : `${modelEntry.make} ${modelEntry.model}`;

    if (!modelKey) {
      return;
    }

    if (!modelCategoryMap.has(modelKey)) {
      modelCategoryMap.set(modelKey, new Set());
    }

    modelCategoryMap.get(modelKey).add(categoryId);
  });
});

if (DEFAULT_CATEGORY) {
  (trackedModels.queries || []).forEach(({ make, model }) => {
    if (!make || !model) return;
    const key = `${make} ${model}`;
    if (!modelCategoryMap.has(key)) {
      modelCategoryMap.set(key, new Set([DEFAULT_CATEGORY]));
    }
  });
}

export function getCategoriesForModel(modelKey) {
  if (!modelKey) {
    return [];
  }

  return Array.from(modelCategoryMap.get(modelKey) || []);
}

export function isModelInCategory(modelKey, categoryId) {
  if (!categoryId || !categoryConfig[categoryId]) {
    return true;
  }

  const categories = modelCategoryMap.get(modelKey);
  if (!categories) {
    return false;
  }

  return categories.has(categoryId);
}

export function filterDataByCategory(data, categoryId) {
  if (!categoryId || !categoryConfig[categoryId]) {
    return data;
  }

  return data
    .map(sourceData => {
      const filteredListings = sourceData.listings.filter(listing => {
        const modelKey = getModelKey(listing);
        return isModelInCategory(modelKey, categoryId);
      });

      if (filteredListings.length === 0) {
        return null;
      }

      return {
        ...sourceData,
        listings: filteredListings
      };
    })
    .filter(Boolean);
}
