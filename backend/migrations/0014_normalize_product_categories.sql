-- Normalize legacy product category keys to match app taxonomy (frontend/src/data/categories.ts)

UPDATE products SET category = 'art', subcategory = CASE
  WHEN subcategory IN ('guitar', 'piano') THEN subcategory
  ELSE subcategory
END WHERE category = 'music';

UPDATE products SET subcategory = 'flexibility' WHERE category = 'fitness' AND subcategory = 'yoga';
UPDATE products SET subcategory = 'strength' WHERE category = 'fitness' AND subcategory IN ('weight-training');
UPDATE products SET subcategory = 'building-muscle' WHERE category = 'fitness' AND subcategory = 'gaining-weight';

UPDATE products SET category = 'nutrition', subcategory = CASE
  WHEN subcategory = 'meal-prep' THEN 'meal-planning'
  WHEN subcategory = 'baking' THEN 'cooking'
  WHEN subcategory IS NULL OR subcategory = '' THEN 'cooking'
  ELSE subcategory
END WHERE category = 'cooking';

UPDATE products SET category = 'mindset', subcategory = 'positive-thinking'
WHERE category = 'mindset' AND subcategory = 'mindfulness';

UPDATE products SET category = 'wellness', subcategory = 'sleep'
WHERE id = 'prod-mindset-004' OR (name LIKE '%Weighted Blanket%' AND category = 'mindset');

UPDATE products SET category = 'discipline', subcategory = COALESCE(NULLIF(subcategory, ''), 'productivity')
WHERE category = 'reading';

UPDATE products SET category = 'language', subcategory = 'spanish'
WHERE category = 'learning';

UPDATE products SET category = 'sustainability', subcategory = CASE
  WHEN subcategory = 'hiking' THEN 'sustainable-living'
  ELSE COALESCE(NULLIF(subcategory, ''), 'sustainable-living')
END WHERE category IN ('travel', 'gardening');
