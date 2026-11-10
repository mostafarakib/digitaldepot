'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { type CategoryTreeNode, type CategoryItem } from '@/lib/catalogue-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  ImageIcon,
} from 'lucide-react';

interface CategoryTreeProps {
  tree: CategoryTreeNode[];
  onAddSubcategory: (parentId: string) => void;
  onEdit: (category: CategoryItem) => void;
  onDelete: (category: CategoryItem, childCount: number) => void;
  onReorder: (items: Array<{ id: string; displayOrder: number }>) => Promise<void>;
  isReordering: boolean;
}

export function CategoryTree({
  tree,
  onAddSubcategory,
  onEdit,
  onDelete,
  onReorder,
  isReordering,
}: CategoryTreeProps) {
  const t = useTranslations('admin.catalogue.categories');
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});

  const toggleCollapse = (id: string) => {
    setCollapsedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleMoveSibling = async (
    siblings: CategoryTreeNode[],
    currentIndex: number,
    direction: 'up' | 'down',
  ) => {
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    const reorderedList = [...siblings];
    const [moved] = reorderedList.splice(currentIndex, 1);
    reorderedList.splice(targetIndex, 0, moved);

    const payload = reorderedList.map((item, index) => ({
      id: item.id,
      displayOrder: index,
    }));

    await onReorder(payload);
  };

  const renderNodes = (nodes: CategoryTreeNode[], depth = 0) => {
    return (
      <div className="space-y-1">
        {nodes.map((node, index) => {
          const hasChildren = node.children && node.children.length > 0;
          const isCollapsed = Boolean(collapsedMap[node.id]);

          return (
            <div key={node.id} className="select-none">
              <div
                className={`group flex items-center justify-between py-2 px-3 rounded-lg border border-border/50 transition-colors ${
                  depth === 0
                    ? 'bg-card hover:bg-muted/40 font-medium'
                    : 'bg-muted/10 hover:bg-muted/30 text-sm'
                } ${!node.isActive ? 'opacity-60' : ''}`}
                style={{ marginLeft: `${depth * 24}px` }}
              >
                {/* Left: Expander, Icon, Name, Badges */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => toggleCollapse(node.id)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  ) : (
                    <span className="w-6 inline-block" />
                  )}

                  <div className="text-primary/70">
                    {hasChildren ? (
                      isCollapsed ? (
                        <Folder className="h-4 w-4" />
                      ) : (
                        <FolderOpen className="h-4 w-4" />
                      )
                    ) : (
                      <Folder className="h-4 w-4 text-muted-foreground/60" />
                    )}
                  </div>

                  {node.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={node.imageUrl}
                      alt={node.name}
                      className="h-6 w-6 rounded object-cover border border-border shrink-0"
                    />
                  ) : (
                    <span className="h-6 w-6 rounded bg-muted/40 border border-border/40 flex items-center justify-center shrink-0">
                      <ImageIcon className="h-3 w-3 text-muted-foreground/40" />
                    </span>
                  )}

                  <span className="truncate font-medium text-foreground">{node.name}</span>

                  <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                    /{node.slug}
                  </span>

                  <Badge
                    variant={node.isActive ? 'outline' : 'secondary'}
                    className="text-[10px] h-5 px-1.5 font-normal"
                  >
                    {node.isActive ? t('statusActive') : t('statusInactive')}
                  </Badge>

                  {hasChildren && (
                    <span className="text-xs text-muted-foreground">
                      ({t('itemsCount', { count: node.children.length })})
                    </span>
                  )}
                </div>

                {/* Right: Sibling Reorder & Action Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Sibling move buttons */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => handleMoveSibling(nodes, index, 'up')}
                    disabled={index === 0 || isReordering}
                    title={t('moveUp')}
                    aria-label={t('moveUp')}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => handleMoveSibling(nodes, index, 'down')}
                    disabled={index === nodes.length - 1 || isReordering}
                    title={t('moveDown')}
                    aria-label={t('moveDown')}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>

                  {/* Add Subcategory */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                    onClick={() => onAddSubcategory(node.id)}
                    title={t('addSubcategory')}
                    aria-label={t('addSubcategory')}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>

                  {/* Edit */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => onEdit(node)}
                    title={t('editCategory')}
                    aria-label={t('editCategory')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(node, node.children?.length ?? 0)}
                    title={t('deleteCategory')}
                    aria-label={t('deleteCategory')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Subtree */}
              {hasChildren && !isCollapsed && (
                <div className="mt-1">{renderNodes(node.children, depth + 1)}</div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (!tree.length) {
    return (
      <div className="text-center py-12 px-4 rounded-xl border border-dashed border-border bg-muted/10">
        <Folder className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1 pb-1">
        <span>{t('treeHelp')}</span>
      </div>
      {renderNodes(tree, 0)}
    </div>
  );
}
