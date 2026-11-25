const { defineRepositoryToken } = require('../../../shared/domain/repository');

const CatalogRepositoryToken = defineRepositoryToken('catalog');
const CatalogStoreToken = defineRepositoryToken('catalog.store');

/**
 * Repository port for the module info entity.
 * @typedef {object} CatalogRepositoryContract
 * @property {(id: string) => Promise<object|null>} get
 * @property {(entity: object) => Promise<object>} save
 * @property {() => Promise<object[]>} list
 */

/**
 * Persistence port for catalog records. All implementations return plain
 * snake_case records with Date values so the service applies identical rules
 * in memory and with Prisma.
 *
 * @typedef {object} CatalogStoreContract
 * @property {(filters?: object) => Promise<object[]>} listCategories
 * @property {(id: string) => Promise<object|null>} findCategory
 * @property {(input: object) => Promise<object>} createCategory
 * @property {(id: string, patch: object) => Promise<object>} updateCategory
 * @property {(filters?: object) => Promise<object[]>} listProducts
 * @property {(id: string) => Promise<object|null>} findProduct
 * @property {(input: object) => Promise<object>} createProduct
 * @property {(id: string, patch: object) => Promise<object>} updateProduct
 * @property {(filters?: object) => Promise<object[]>} listVarieties
 * @property {(id: string) => Promise<object|null>} findVariety
 * @property {(input: object) => Promise<object>} createVariety
 * @property {(id: string, patch: object) => Promise<object>} updateVariety
 * @property {(filters?: object) => Promise<object[]>} listAttributes
 * @property {(id: string) => Promise<object|null>} findAttribute
 * @property {(input: object) => Promise<object>} createAttribute
 * @property {(id: string, patch: object) => Promise<object>} updateAttribute
 * @property {(filters?: object) => Promise<object[]>} listAttributeValues
 * @property {(input: object) => Promise<object>} createAttributeValue
 * @property {(entityType: string, entityId: string) => Promise<number>} deleteAttributeValues
 * @property {(filters?: object) => Promise<object[]>} listImages
 * @property {(id: string) => Promise<object|null>} findImage
 * @property {(input: object) => Promise<object>} createImage
 * @property {(id: string) => Promise<object>} deleteImage
 * @property {(filters?: object) => Promise<object[]>} listUnits
 * @property {(id: string) => Promise<object|null>} findUnit
 * @property {(input: object) => Promise<object>} createUnit
 * @property {(id: string, patch: object) => Promise<object>} updateUnit
 * @property {(filters?: object) => Promise<object[]>} listQualityGrades
 * @property {(id: string) => Promise<object|null>} findQualityGrade
 * @property {(input: object) => Promise<object>} createQualityGrade
 * @property {(id: string, patch: object) => Promise<object>} updateQualityGrade
 */

const CATALOG_STORE_METHODS = Object.freeze([
  'listCategories',
  'findCategory',
  'createCategory',
  'updateCategory',
  'listProducts',
  'findProduct',
  'createProduct',
  'updateProduct',
  'listVarieties',
  'findVariety',
  'createVariety',
  'updateVariety',
  'listAttributes',
  'findAttribute',
  'createAttribute',
  'updateAttribute',
  'listAttributeValues',
  'createAttributeValue',
  'deleteAttributeValues',
  'listImages',
  'findImage',
  'createImage',
  'deleteImage',
  'listUnits',
  'findUnit',
  'createUnit',
  'updateUnit',
  'listQualityGrades',
  'findQualityGrade',
  'createQualityGrade',
  'updateQualityGrade',
]);

module.exports = {
  CATALOG_STORE_METHODS,
  CatalogRepositoryToken,
  CatalogStoreToken,
};
