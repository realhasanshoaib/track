import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  CloudUploadIcon,
  Link04Icon,
  Loading03Icon,
  RemoveCircleIcon,
  SparklesIcon,
  StickyNote02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useAction, useMutation } from 'convex/react'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '../../../../../../convex/_generated/api'
import type { Id } from '../../../../../../convex/_generated/dataModel'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Textarea } from '#/components/ui/textarea'
import { useReleaseConfig } from '#/lib/release-config'
import { cn } from '#/lib/utils'
import { formatFileSize, formatNumber } from '#/i18n'

import { IMPORT_SOURCES } from './import-source-logos'

type ProjectMemoryImportDialogProps = {
  actorId: Id<'users'> | null
  groupId: Id<'groups'> | null
  groupName?: string
  onBusyChange?: (busy: boolean) => void
  onError?: (error: unknown) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  projectId: Id<'projects'> | null
}

type Status =
  | { kind: 'working'; message: string }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string }

export function ProjectMemoryImportDialog({
  actorId,
  groupId,
  groupName,
  onBusyChange,
  onError,
  onOpenChange,
  open,
  projectId,
}: ProjectMemoryImportDialogProps) {
  const { t } = useTranslation('workspace')
  const release = useReleaseConfig()
  const generateGroupUploadUrl = useMutation(api.messages.generateUploadUrl)
  const startMemoryImport = useAction((api as any).memoryActions.startImport)
  const extractTasks = useAction(api.taskMemoryExtractionNode.request)
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [links, setLinks] = useState('')
  const [files, setFiles] = useState<Array<File>>([])
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [findTasks, setFindTasks] = useState(false)

  const linkCount = links.split('\n').map((link) => link.trim()).filter(Boolean).length
  const hasInput = Boolean(text.trim()) || linkCount > 0 || files.length > 0

  function addFiles(incoming: FileList | null) {
    if (!incoming?.length) return
    setFiles((current) => [...current, ...Array.from(incoming)])
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    if (!projectId || !groupId || !actorId) return
    const pastedText = text.trim()
    const sourceUrls = links
      .split('\n')
      .map((link) => link.trim())
      .filter(Boolean)
    if (!hasInput) {
      setStatus({ kind: 'error', message: t('memory.addInput') })
      return
    }

    setBusy(true)
    onBusyChange?.(true)
    try {
      const sourceFiles: Array<{
        storageId: Id<'_storage'>
        filename: string
        contentType: string
        size: number
      }> = []
      for (const [index, file] of files.entries()) {
        setStatus({ kind: 'working', message: t('memory.uploading', { name: file.name, current: formatNumber(index + 1), total: formatNumber(files.length) }) })
        const uploadUrl = await generateGroupUploadUrl({ groupId, userId: actorId })
        const response = await fetch(uploadUrl, {
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          method: 'POST',
        })
        if (!response.ok) throw new Error(`upload_failed:${file.name}`)
        const { storageId } = await response.json() as { storageId: Id<'_storage'> }
        sourceFiles.push({
          contentType: file.type || 'application/octet-stream',
          filename: file.name,
          size: file.size,
          storageId,
        })
      }
      setStatus({ kind: 'working', message: t('memory.readingContext') })
      const result = await startMemoryImport({
        actorId,
        groupId,
        pastedText: pastedText || undefined,
        projectId,
        sourceFiles,
        sourceStorageIds: sourceFiles.map((file) => file.storageId),
        sourceUrls,
      }) as { importId: Id<'memoryImports'>; summary?: string }
      let taskMessage = ''
      if (findTasks && release.tasks) {
        setStatus({ kind: 'working', message: t('memory.findingTasks') })
        try {
          const extraction = await extractTasks({ importId: result.importId })
          taskMessage = ` ${t('memory.tasksAdded', { count: formatNumber(extraction.created) })}`
        } catch (error) {
          taskMessage = ` ${t('memory.taskExtractionFailed')}`
          onError?.(error)
        }
      }
      setStatus({
        kind: 'done',
        message: `${result.summary ?? t('memory.importComplete')}${taskMessage}`,
      })
      setText('')
      setLinks('')
      setFiles([])
    } catch (error) {
      setStatus({
        kind: 'error',
        message: t('memory.importFailed'),
      })
      onError?.(error)
    } finally {
      setBusy(false)
      onBusyChange?.(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="flex-row items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/25">
            <HugeiconsIcon icon={SparklesIcon} size={18} strokeWidth={2} />
          </span>
          <div className="flex flex-col gap-1">
            <DialogTitle>{t('memory.title')}</DialogTitle>
            <DialogDescription>
              {t('memory.description', { group: groupName ?? t('memory.thisChannel') })}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <div className="flex items-center -space-x-1.5">
            {IMPORT_SOURCES.map(({ id, label, Logo }) => (
              <span
                key={id}
                title={label}
                className="flex size-6 items-center justify-center rounded-full bg-white ring-1 ring-border"
              >
                <Logo aria-label={label} className="size-3.5" role="img" />
              </span>
            ))}
          </div>
          <span className="text-xs/relaxed text-muted-foreground">
            {t('memory.supportedSources')}
          </span>
        </div>

        <Tabs defaultValue="text">
          <TabsList className="w-full">
            <TabsTrigger value="text">
              <HugeiconsIcon icon={StickyNote02Icon} strokeWidth={2} />
              {t('memory.textTab')}
            </TabsTrigger>
            <TabsTrigger value="links">
              <HugeiconsIcon icon={Link04Icon} strokeWidth={2} />
              {t('memory.linksTab')}{linkCount ? ` (${formatNumber(linkCount)})` : ''}
            </TabsTrigger>
            <TabsTrigger value="files">
              <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={2} />
              {t('memory.filesTab')}{files.length ? ` (${formatNumber(files.length)})` : ''}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="pt-3">
            <Textarea
              aria-label={t('memory.pasteText')}
              className="min-h-32"
              onChange={(event) => setText(event.currentTarget.value)}
              placeholder={t('memory.textPlaceholder')}
              value={text}
            />
          </TabsContent>

          <TabsContent value="links" className="pt-3">
            <Textarea
              aria-label={t('memory.addLinks')}
              className="min-h-32"
              onChange={(event) => setLinks(event.currentTarget.value)}
              placeholder={t('memory.linksPlaceholder')}
              value={links}
            />
          </TabsContent>

          <TabsContent value="files" className="flex flex-col gap-2 pt-3">
            <label
              htmlFor={fileInputId}
              onDragLeave={() => setDragging(false)}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                addFiles(event.dataTransfer.files)
              }}
              className={cn(
                'flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center transition-colors hover:border-accent/50 hover:bg-accent/5',
                dragging && 'border-accent bg-accent/10',
              )}
            >
              <HugeiconsIcon className="text-muted-foreground" icon={CloudUploadIcon} size={22} strokeWidth={1.8} />
              <span className="text-xs/relaxed font-medium">
                {t('memory.dropFiles')} <span className="text-accent">{t('memory.browse')}</span>
              </span>
              <span className="text-xs/relaxed text-muted-foreground">{t('memory.fileTypes')}</span>
              <input
                className="sr-only"
                id={fileInputId}
                multiple
                onChange={(event) => addFiles(event.currentTarget.files)}
                ref={fileInputRef}
                type="file"
              />
            </label>
            {files.length ? (
              <ul className="flex flex-col gap-1">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5"
                  >
                    <span className="truncate text-xs/relaxed font-medium">{file.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs/relaxed text-muted-foreground">{formatFileSize(file.size)}</span>
                      <button
                        aria-label={t('memory.removeFile', { name: file.name })}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        onClick={() => removeFile(index)}
                        type="button"
                      >
                        <HugeiconsIcon icon={RemoveCircleIcon} size={15} strokeWidth={2} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </TabsContent>
        </Tabs>

        {release.tasks ? <label className="flex items-center gap-2 text-xs/relaxed"><input checked={findTasks} onChange={(event) => setFindTasks(event.currentTarget.checked)} type="checkbox" /> {t('memory.findTasks')}</label> : null}

        {status ? (
          <p
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-xs/relaxed',
              status.kind === 'done' && 'border-accent/30 bg-accent/10 text-foreground',
              status.kind === 'error' && 'border-destructive/30 bg-destructive/10 text-destructive',
              status.kind === 'working' && 'border-border bg-muted/40 text-muted-foreground',
            )}
          >
            <HugeiconsIcon
              className={cn('shrink-0', status.kind === 'working' && 'animate-spin')}
              icon={
                status.kind === 'done'
                  ? CheckmarkCircle02Icon
                  : status.kind === 'error'
                    ? Alert02Icon
                    : Loading03Icon
              }
              size={15}
              strokeWidth={2}
            />
            {status.message}
          </p>
        ) : null}

        <DialogFooter showCloseButton>
          <Button
            disabled={busy || !hasInput || !projectId || !groupId || !actorId}
            onClick={() => void handleSubmit()}
            type="button"
          >
            {busy ? (
              <>
                <HugeiconsIcon className="animate-spin" icon={Loading03Icon} strokeWidth={2} />
                {t('memory.importing')}
              </>
            ) : (
              <>
                <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
                {t('memory.startImport')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
