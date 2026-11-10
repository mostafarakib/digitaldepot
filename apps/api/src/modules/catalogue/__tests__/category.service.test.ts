import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../../lib/prisma.js';
import { cleanDatabase, testPool } from '../../../test/setup.js';
import { categoryService } from '../category.service.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../../lib/errors.js';

describe('CategoryService Unit Tests (Phase 4A)', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await testPool.end();
  });

  describe('Tree Building and Retrieval', () => {
    it('correctly assembles nested category tree with active and inactive filtering', async () => {
      // 1. Root category (Active)
      const root1 = await categoryService.create({
        name: 'Electronics',
        slug: 'electronics',
        isActive: true,
        displayOrder: 0,
      });

      // 2. Child category (Active)
      const child1 = await categoryService.create({
        name: 'Smartphones',
        slug: 'smartphones',
        parentId: root1.id,
        isActive: true,
        displayOrder: 0,
      });

      // 3. Grandchild category (Inactive)
      await categoryService.create({
        name: 'Refurbished Phones',
        slug: 'refurbished-phones',
        parentId: child1.id,
        isActive: false,
        displayOrder: 1,
      });

      // 4. Second Root category (Inactive)
      await categoryService.create({
        name: 'Archive',
        slug: 'archive',
        isActive: false,
        displayOrder: 1,
      });

      // Admin Tree: contains all nodes
      const adminTree = await categoryService.getTree({ onlyActive: false });
      expect(adminTree).toHaveLength(2);
      const electronicsAdmin = adminTree.find((n) => n.id === root1.id);
      expect(electronicsAdmin).toBeDefined();
      expect(electronicsAdmin!.children).toHaveLength(1);
      expect(electronicsAdmin!.children[0].children).toHaveLength(1);

      // Public Tree: contains only active nodes
      const publicTree = await categoryService.getTree({ onlyActive: true });
      expect(publicTree).toHaveLength(1);
      const electronicsPublic = publicTree[0];
      expect(electronicsPublic.name).toBe('Electronics');
      expect(electronicsPublic.children).toHaveLength(1);
      expect(electronicsPublic.children[0].name).toBe('Smartphones');
      // Inactive grandchild is excluded from public tree
      expect(electronicsPublic.children[0].children).toHaveLength(0);
    });
  });

  describe('Cycle Prevention', () => {
    it('prevents self-parenting', async () => {
      const cat = await categoryService.create({
        name: 'Laptops',
        slug: 'laptops',
      });

      await expect(categoryService.update(cat.id, { parentId: cat.id })).rejects.toThrow(
        BadRequestError,
      );

      await expect(categoryService.update(cat.id, { parentId: cat.id })).rejects.toThrow(
        'A category cannot be its own parent',
      );
    });

    it('prevents assigning a descendant as parent (cycle detection)', async () => {
      // Hierarchy: Root -> Child -> Grandchild
      const root = await categoryService.create({ name: 'Root', slug: 'root' });
      const child = await categoryService.create({
        name: 'Child',
        slug: 'child',
        parentId: root.id,
      });
      const grandchild = await categoryService.create({
        name: 'Grandchild',
        slug: 'grandchild',
        parentId: child.id,
      });

      // Attempt to make Grandchild the parent of Root
      await expect(categoryService.update(root.id, { parentId: grandchild.id })).rejects.toThrow(
        BadRequestError,
      );

      await expect(categoryService.update(root.id, { parentId: grandchild.id })).rejects.toThrow(
        'A category cannot be assigned to one of its own descendants as parent',
      );

      // Attempt to make Child the parent of Root
      await expect(categoryService.update(root.id, { parentId: child.id })).rejects.toThrow(
        BadRequestError,
      );
    });

    it('allows valid reparenting that does not create cycles', async () => {
      const root1 = await categoryService.create({ name: 'Root 1', slug: 'root-1' });
      const root2 = await categoryService.create({ name: 'Root 2', slug: 'root-2' });
      const item = await categoryService.create({ name: 'Item', slug: 'item', parentId: root1.id });

      // Move Item from Root 1 to Root 2
      const updated = await categoryService.update(item.id, { parentId: root2.id });
      expect(updated.parentId).toBe(root2.id);

      // Move Item to top-level (null parent)
      const topLevel = await categoryService.update(item.id, { parentId: null });
      expect(topLevel.parentId).toBeNull();
    });
  });

  describe('Slug Uniqueness', () => {
    it('rejects duplicate slugs on creation', async () => {
      await categoryService.create({ name: 'Accessories', slug: 'accessories' });

      await expect(
        categoryService.create({ name: 'Other Accessories', slug: 'accessories' }),
      ).rejects.toThrow(ConflictError);
    });

    it('rejects slug collision on update', async () => {
      await categoryService.create({ name: 'Monitors', slug: 'monitors' });
      const cat2 = await categoryService.create({ name: 'Displays', slug: 'displays' });

      await expect(categoryService.update(cat2.id, { slug: 'monitors' })).rejects.toThrow(
        ConflictError,
      );
    });
  });

  describe('Bulk Reordering', () => {
    it('atomically updates display orders', async () => {
      const c1 = await categoryService.create({ name: 'Cat 1', slug: 'cat-1', displayOrder: 0 });
      const c2 = await categoryService.create({ name: 'Cat 2', slug: 'cat-2', displayOrder: 1 });
      const c3 = await categoryService.create({ name: 'Cat 3', slug: 'cat-3', displayOrder: 2 });

      await categoryService.reorder({
        items: [
          { id: c1.id, displayOrder: 2 },
          { id: c2.id, displayOrder: 0 },
          { id: c3.id, displayOrder: 1 },
        ],
      });

      const updatedC1 = await categoryService.getById(c1.id);
      const updatedC2 = await categoryService.getById(c2.id);
      const updatedC3 = await categoryService.getById(c3.id);

      expect(updatedC1.displayOrder).toBe(2);
      expect(updatedC2.displayOrder).toBe(0);
      expect(updatedC3.displayOrder).toBe(1);
    });

    it('rejects reorder with duplicate category IDs', async () => {
      const c1 = await categoryService.create({ name: 'Cat 1', slug: 'cat-1' });

      await expect(
        categoryService.reorder({
          items: [
            { id: c1.id, displayOrder: 0 },
            { id: c1.id, displayOrder: 1 },
          ],
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it('rejects reorder if a category does not exist', async () => {
      await expect(
        categoryService.reorder({
          items: [{ id: 'non-existent-id', displayOrder: 0 }],
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Category Deletion Restrictions', () => {
    it('prevents deleting a category that has subcategories', async () => {
      const parent = await categoryService.create({ name: 'Parent', slug: 'parent' });
      await categoryService.create({ name: 'Child', slug: 'child', parentId: parent.id });

      await expect(categoryService.delete(parent.id)).rejects.toThrow(ConflictError);
      await expect(categoryService.delete(parent.id)).rejects.toThrow('contains 1 subcategories');
    });

    it('allows deleting a leaf category with no subcategories', async () => {
      const leaf = await categoryService.create({ name: 'Leaf', slug: 'leaf' });
      const result = await categoryService.delete(leaf.id);
      expect(result.success).toBe(true);

      const exists = await prisma.category.findUnique({ where: { id: leaf.id } });
      expect(exists).toBeNull();
    });
  });
});
