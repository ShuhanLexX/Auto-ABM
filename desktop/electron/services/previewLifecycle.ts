type NavigationDetails = {
  isSameDocument?: boolean
  isMainFrame?: boolean
}

export type PreviewCleanupWebContents = {
  on(
    event: 'did-start-navigation',
    handler: (
      details: NavigationDetails,
      url?: string,
      isInPlace?: boolean,
      isMainFrame?: boolean,
    ) => void,
  ): unknown
}

function isMainFrameNavigation(
  details: NavigationDetails,
  deprecatedIsMainFrame?: boolean,
) {
  return details.isMainFrame ?? deprecatedIsMainFrame === true
}

function isSameDocumentNavigation(
  details: NavigationDetails,
  deprecatedIsInPlace?: boolean,
) {
  return details.isSameDocument ?? deprecatedIsInPlace === true
}

export function installPreviewCleanupOnRendererNavigation(
  webContents: PreviewCleanupWebContents,
  closePreview: () => void,
): void {
  webContents.on('did-start-navigation', (details, _url, isInPlace, isMainFrame) => {
    if (!isMainFrameNavigation(details, isMainFrame)) return
    if (isSameDocumentNavigation(details, isInPlace)) return

    closePreview()
  })
}
