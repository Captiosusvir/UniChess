// Stockfish engine wrapper using Web Worker
export type AnalysisResult = {
  depth: number
  score: number | null   // centipawns / 100, null if mate
  mate: number | null     // mate in N, null if cp score
  bestMove: string | null
  pv: string              // principal variation line
}

export class StockfishEngine {
  private worker: Worker | null = null
  private onAnalysis: ((result: AnalysisResult) => void) | null = null
  private onBestMove: ((move: string) => void) | null = null
  private ready = false
  private currentAnalysis: AnalysisResult = {
    depth: 0, score: 0, mate: null, bestMove: null, pv: ''
  }

  async init(): Promise<boolean> {
    if (typeof window === 'undefined') return false

    return new Promise((resolve) => {
      try {
        // Use stockfish.js from CDN via blob worker
        const code = `importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');`
        const blob = new Blob([code], { type: 'application/javascript' })
        this.worker = new Worker(URL.createObjectURL(blob))

        this.worker.onmessage = (e: MessageEvent) => {
          this.handleMessage(String(e.data))
        }

        this.worker.onerror = () => {
          console.warn('Stockfish CDN failed, using fallback eval')
          this.worker = null
          resolve(false)
        }

        // UCI init
        this.send('uci')

        // Wait for uciok
        const origHandler = this.worker.onmessage
        this.worker.onmessage = (e: MessageEvent) => {
          const msg = String(e.data)
          if (msg === 'uciok') {
            this.ready = true
            this.worker!.onmessage = origHandler
            this.send('setoption name Threads value 1')
            this.send('setoption name Hash value 32')
            this.send('isready')
            resolve(true)
          }
        }

        // Timeout fallback
        setTimeout(() => {
          if (!this.ready) {
            this.worker = null
            resolve(false)
          }
        }, 5000)
      } catch {
        this.worker = null
        resolve(false)
      }
    })
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd)
  }

  private handleMessage(msg: string) {
    // Parse "info" lines
    if (msg.startsWith('info') && msg.includes('depth')) {
      const depthMatch = msg.match(/depth (\d+)/)
      const scoreMatch = msg.match(/score cp (-?\d+)/)
      const mateMatch = msg.match(/score mate (-?\d+)/)
      const pvMatch = msg.match(/ pv (.+)/)

      if (depthMatch) {
        this.currentAnalysis = {
          depth: parseInt(depthMatch[1]),
          score: scoreMatch ? parseInt(scoreMatch[1]) / 100 : null,
          mate: mateMatch ? parseInt(mateMatch[1]) : null,
          bestMove: pvMatch ? pvMatch[1].split(' ')[0] : null,
          pv: pvMatch ? pvMatch[1] : ''
        }
        this.onAnalysis?.(this.currentAnalysis)
      }
    }

    // Parse "bestmove" lines
    if (msg.startsWith('bestmove')) {
      const move = msg.split(' ')[1]
      if (move && move !== '(none)') {
        this.onBestMove?.(move)
      }
    }
  }

  setSkillLevel(level: number) {
    // level 0-20
    this.send(`setoption name Skill Level value ${level}`)
  }

  analyze(fen: string, depth = 20) {
    if (!this.worker) {
      // Fallback evaluation
      this.onAnalysis?.({
        depth,
        score: this.fallbackEval(fen),
        mate: null,
        bestMove: null,
        pv: ''
      })
      return
    }
    this.send('stop')
    this.send(`position fen ${fen}`)
    this.send(`go depth ${depth}`)
  }

  findBestMove(fen: string, depth = 12, skillLevel = 20): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.worker) {
        resolve(null)
        return
      }
      this.send('stop')
      this.setSkillLevel(skillLevel)
      this.send(`position fen ${fen}`)

      const prevCallback = this.onBestMove
      this.onBestMove = (move: string) => {
        this.onBestMove = prevCallback
        resolve(move)
      }

      this.send(`go depth ${depth}`)

      // Safety timeout
      setTimeout(() => resolve(null), 10000)
    })
  }

  stop() {
    this.send('stop')
  }

  setOnAnalysis(cb: (result: AnalysisResult) => void) {
    this.onAnalysis = cb
  }

  private fallbackEval(fen: string): number {
    const values: Record<string, number> = {
      P: 1, N: 3, B: 3.25, R: 5, Q: 9, K: 0,
      p: -1, n: -3, b: -3.25, r: -5, q: -9, k: 0
    }
    let score = 0
    for (const ch of fen.split(' ')[0]) {
      if (values[ch] !== undefined) score += values[ch]
    }
    return score
  }

  destroy() {
    this.send('quit')
    this.worker?.terminate()
    this.worker = null
  }
}
