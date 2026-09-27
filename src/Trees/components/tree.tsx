import { ChevronRight, Folder, FolderOpen, Loader2 } from 'lucide-react'
import { useTree } from '../hooks/use-tree'
import type { TreeData } from '../hooks/use-tree'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface TreeProps {
  /** Folders whose children are rendered; "" is the library root (the API's path for it). */
  expandedPaths: string[]
  /**
   * Folder to highlight as the current one; undefined means the library root.
   * It is only used to draw the highlight: it never opens or loads a level.
   */
  scope?: string
  /** Ask for a branch to be opened or closed: the owner keeps the state. */
  onExpandedPathsChange: (expandedPaths: string[]) => void
  /** Select a folder; undefined selects the library root. */
  onScopeChange: (scope?: string) => void
}

interface TreeNodeProps {
  tree: TreeData
  expandedPaths: string[]
  scope?: string
  onExpandedPathsChange: (expandedPaths: string[]) => void
  onScopeChange: (scope?: string) => void
  path: string
  name: string
  projectCount: number
  hasChildren: boolean
  depth: number
}

/** Single row of the navigator. Children are only mounted while open. */
function TreeNode({
  tree,
  expandedPaths,
  scope,
  onExpandedPathsChange,
  onScopeChange,
  path,
  name,
  projectCount,
  hasChildren,
  depth,
}: TreeNodeProps) {
  const open = expandedPaths.includes(path)
  const selected = scope === path
  const children = tree.childrenOf(path)
  const loading = tree.isLoading(path)
  const isLeaf = !hasChildren && projectCount === 0

  const toggle = () => {
    onExpandedPathsChange(open ? expandedPaths.filter((item) => item !== path) : [...expandedPaths, path])
  }

  const select = () => {
    onScopeChange(path)
    // Selecting a folder also opens it, so its subfolders are visible right away.
    if (hasChildren && !open) toggle()
  }

  return (
    <li role="none">
      <div
        role="treeitem"
        aria-expanded={hasChildren ? open : undefined}
        aria-selected={selected}
        className={cn(
          'flex items-center gap-1 rounded-md pr-2 text-sm transition-colors',
          selected ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        <button
          type="button"
          aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded text-muted-foreground/70 hover:text-foreground',
            !hasChildren && 'invisible',
          )}
          onClick={(event) => {
            event.stopPropagation()
            toggle()
          }}
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
          )}
        </button>

        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left" onClick={select}>
          {isLeaf ? (
            <Folder className="size-3.5 shrink-0 opacity-60" />
          ) : open ? (
            <FolderOpen className="size-3.5 shrink-0 text-primary/80" />
          ) : (
            <Folder className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{name}</span>
          {projectCount > 0 ? (
            <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {projectCount}
            </span>
          ) : null}
        </button>
      </div>

      {open && children && children.length > 0 ? (
        <ul role="group" className="mt-0.5 space-y-0.5">
          {children.map((child) => (
            <TreeNode
              key={child.path}
              tree={tree}
              expandedPaths={expandedPaths}
              scope={scope}
              onExpandedPathsChange={onExpandedPathsChange}
              onScopeChange={onScopeChange}
              path={child.path}
              name={child.name}
              projectCount={child.projectCount}
              hasChildren={child.hasChildren}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/**
 * Folder tree.
 *
 * It resolves the data of the folders that are open, highlights the current one
 * and asks its owner for both changes: opening or closing a branch, and moving
 * the selection.
 */
export function Tree({ expandedPaths, scope, onExpandedPathsChange, onScopeChange }: TreeProps) {
  const tree = useTree(expandedPaths)
  const rootOpen = expandedPaths.includes('')
  const rootSelected = !scope

  const toggleRoot = () => {
    onExpandedPathsChange(
      rootOpen ? expandedPaths.filter((item) => item !== '') : [...expandedPaths, ''],
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Folders</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-[10px] text-muted-foreground/70">lazy tree</span>
          </TooltipTrigger>
          <TooltipContent>Deeper levels are loaded from the local database on demand.</TooltipContent>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        <ul role="tree" aria-label="Folder tree" className="space-y-0.5">
          <li role="none">
            <div
              role="treeitem"
              aria-expanded={rootOpen}
              aria-selected={rootSelected}
              className={cn(
                'flex items-center gap-1 rounded-md pr-2 text-sm transition-colors',
                rootSelected
                  ? 'bg-primary/15 text-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <button
                type="button"
                aria-label={rootOpen ? 'Collapse root' : 'Expand root'}
                className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground/70 hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation()
                  toggleRoot()
                }}
              >
                {tree.loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ChevronRight className={cn('size-3.5 transition-transform', rootOpen && 'rotate-90')} />
                )}
              </button>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
                onClick={() => onScopeChange(undefined)}
              >
                {rootOpen ? (
                  <FolderOpen className="size-3.5 shrink-0 text-primary/80" />
                ) : (
                  <Folder className="size-3.5 shrink-0" />
                )}
                <span className="truncate font-medium">{tree.name}</span>
                {tree.projectCount !== undefined && tree.projectCount > 0 ? (
                  <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {tree.projectCount}
                  </span>
                ) : null}
              </button>
            </div>

            {rootOpen && tree.children && tree.children.length > 0 ? (
              <ul role="group" className="mt-0.5 space-y-0.5">
                {tree.children.map((child) => (
                  <TreeNode
                    key={child.path}
                    tree={tree}
                    expandedPaths={expandedPaths}
                    scope={scope}
                    onExpandedPathsChange={onExpandedPathsChange}
                    onScopeChange={onScopeChange}
                    path={child.path}
                    name={child.name}
                    projectCount={child.projectCount}
                    hasChildren={child.hasChildren}
                    depth={1}
                  />
                ))}
              </ul>
            ) : null}
          </li>
        </ul>
      </div>
    </div>
  )
}
