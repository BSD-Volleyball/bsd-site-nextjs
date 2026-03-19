export interface PlayerRatingAverages {
    overall: number | null
    passing: number | null
    setting: number | null
    hitting: number | null
    serving: number | null
    sampleCount: number
    sampleEvaluatorNames: string[]
    seasonLabels: string[]
}

export interface PlayerRatingSharedNote {
    seasonId: number
    seasonLabel: string
    note: string
    evaluatorId: string
    evaluatorName: string
    updatedAt: Date
}

export interface PlayerRatingPrivateNote {
    seasonId: number
    seasonLabel: string
    note: string
    evaluatorId: string
    evaluatorName: string
    updatedAt: Date
}

export interface PlayerViewerRating {
    overall: number | null
    passing: number | null
    setting: number | null
    hitting: number | null
    serving: number | null
    privateNote: string | null
    seasonLabel: string
}

export interface PlayerRatingsSectionData {
    averages: PlayerRatingAverages
    sharedNotes: PlayerRatingSharedNote[]
    privateNotes: PlayerRatingPrivateNote[]
    viewerRating: PlayerViewerRating | null
}

export function getEmptyPlayerRatingAverages(): PlayerRatingAverages {
    return {
        overall: null,
        passing: null,
        setting: null,
        hitting: null,
        serving: null,
        sampleCount: 0,
        sampleEvaluatorNames: [],
        seasonLabels: []
    }
}
