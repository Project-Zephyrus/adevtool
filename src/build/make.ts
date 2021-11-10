import { basename } from 'path'
import { BlobEntry } from '../blobs/entry'
import { PartitionProps } from '../blobs/props'

export const MAKEFILE_HEADER = `# Generated by adevtool; do not edit
# For more info, see https://github.com/kdrag0n/adevtool`
const CONT_SEPARATOR = ' \\\n    '

export interface Symlink {
  moduleName: string
  linkPartition: string
  linkSubpath: string
  targetPath: string
}

export interface ModulesMakefile {
  device: string
  vendor: string

  radioFiles?: Array<string>

  symlinks: Array<Symlink>
}

export interface ProductMakefile {
  namespaces?: Array<string>
  copyFiles?: Array<string>
  packages?: Array<string>

  props?: PartitionProps
  fingerprint?: string
}

export interface BoardMakefile {
  abOtaPartitions?: Array<string>
  boardInfo?: string
}

export function sanitizeBasename(path: string) {
  return basename(path).replaceAll(/[^a-z0-9_\-.]/g, '_')
}

function partPathToMakePath(partition: string, subpath: string) {
  let copyPart = partition == 'system' ? 'PRODUCT_OUT' : `TARGET_COPY_OUT_${partition.toUpperCase()}`
  return `$(${copyPart})/${subpath}`
}

export function blobToFileCopy(entry: BlobEntry, proprietaryDir: string) {
  let destPath = partPathToMakePath(entry.partition, entry.path)
  return `${proprietaryDir}/${entry.srcPath}:${destPath}`
}

export function serializeModulesMakefile(mk: ModulesMakefile) {
  let blocks = [
    MAKEFILE_HEADER,
    'LOCAL_PATH := $(call my-dir)',
    `ifeq ($(TARGET_DEVICE),${mk.device})`,
  ]

  if (mk.radioFiles != undefined) {
    blocks.push(mk.radioFiles.map(img => `$(call add-radio-file,${img})`).join('\n'))
  }

  for (let link of mk.symlinks) {
    let destPath = partPathToMakePath(link.linkPartition, link.linkSubpath)

    blocks.push(`include $(CLEAR_VARS)
LOCAL_MODULE := ${link.moduleName}
LOCAL_MODULE_CLASS := FAKE
LOCAL_MODULE_TAGS := optional
LOCAL_MODULE_OWNER := ${mk.vendor}
include $(BUILD_SYSTEM)/base_rules.mk
$(LOCAL_BUILT_MODULE): TARGET := ${link.targetPath}
$(LOCAL_BUILT_MODULE): SYMLINK := ${destPath}
$(LOCAL_BUILT_MODULE):
\t$(hide) mkdir -p $(dir $@)
\t$(hide) mkdir -p $(dir $(SYMLINK))
\t$(hide) rm -rf $@
\t$(hide) rm -rf $(SYMLINK)
\t$(hide) ln -sf $(TARGET) $(SYMLINK)
\t$(hide) touch $@`)
  }

  blocks.push('endif')
  return blocks.join('\n\n')
}

function addContBlock(blocks: Array<string>, variable: String, items: Array<string> | undefined) {
  if (items != undefined) {
    blocks.push(`${variable} += \\
    ${items.join(CONT_SEPARATOR)}`)
  }
}

export function serializeProductMakefile(mk: ProductMakefile) {
  let blocks = [MAKEFILE_HEADER]

  addContBlock(blocks, 'PRODUCT_SOONG_NAMESPACES', mk.namespaces)
  addContBlock(blocks, 'PRODUCT_COPY_FILES', mk.copyFiles)
  addContBlock(blocks, 'PRODUCT_PACKAGES', mk.packages)

  if (mk.props != undefined) {
    for (let [partition, props] of mk.props.entries()) {
      if (props.size == 0) {
        continue
      }

      let propLines = Array.from(props.entries()).map(([k, v]) => `${k}=${v}`)

      blocks.push(`PRODUCT_${partition.toUpperCase()}_PROPERTIES += \\
    ${propLines.join(CONT_SEPARATOR)}`)
    }
  }

  if (mk.fingerprint != undefined) {
    blocks.push(`PRODUCT_OVERRIDE_FINGERPRINT += ${mk.fingerprint}`)
  }

  return blocks.join('\n\n')
}

export function serializeBoardMakefile(mk: BoardMakefile) {
  let blocks = [MAKEFILE_HEADER]

  addContBlock(blocks, 'AB_OTA_PARTITIONS', mk.abOtaPartitions)

  if (mk.boardInfo != undefined) {
    blocks.push(`TARGET_BOARD_INFO_FILE := ${mk.boardInfo}`)
  }

  return blocks.join('\n\n')
}
