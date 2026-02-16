'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Chess } from 'chess.js'
import { ChessBoard } from './components/ChessBoard'
import {
  RotateCcw, Play, Pause, Settings, Users, Trophy, Brain,
  ChevronRight, AlertTriangle, Target, Zap, Flag, Hand, LogIn, LogOut
} from 'lucide-react'

// Netlify Identity types
declare global {
  interface Window {
    netlifyIdentity: any
  }
}

// Bot definitions
type Bot = {
  id: string
  name: string
  rating: number
  avatar: string
  desc: string
  skill: number
}

const BOTS: Bot[] = [
  { id: 'beginner', name: 'Rookie', rating: 800, avatar: '♟️', desc: 'Just learning', skill: 0 },
  { id: 'intermediate', name: 'Club Player', rating: 1400, avatar: '♞', desc: 'Solid player', skill: 5 },
  { id: 'advanced', name: 'Master', rating: 2000, avatar: '♝', desc: 'Tournament ready', skill: 10 },
  { id: 'expert', name: 'Grandmaster', rating: 2600, avatar: '♜', desc: 'Near顶级', skill: 15 },
  { id: 'stockfish', name: 'Stockfish', rating: 3200, avatar: '♛', desc: 'World引擎', skill: 20 },
]

// Stockfish Engine class
class StockfishEngine {
  private worker: any = null
  private ready = false
  private resolveReady: ((ready: boolean) => void) | null = null
  private messageHandler: ((msg: string) => void) | null = null

  async init(): Promise<boolean> {
    if (typeof window === 'undefined') return false

    return new Promise((resolve) => {
      this.resolveReady = resolve
      
      // Use lichess stockfish.js from CDN
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/7.0.0/stockfish.js'
      script.crossOrigin = 'anonymous'
      
      script.onload = () => {
        console.log('Stockfish script loaded')
        try {
          // @ts-ignore
          this.worker = window.stockfish()
          if (this.worker) {
            this.worker.onmessage = (e: MessageEvent) => {
              const msg = String(e.data)
              console.log('SF msg:', msg.substring(0, 80))
              if (msg.includes('uciok') && !this.ready) {
                this.ready = true
                if (this.resolveReady) {
                  this.resolveReady(true)
                  this.resolveReady = null
                }
              }
              // Pass messages to handler
              if (this.messageHandler) {
                this.messageHandler(msg)
              }
            }
            this.worker.postMessage('uci')
            // Wait for uciok
            setTimeout(() => {
              if (this.ready && this.resolveReady) {
                this.resolveReady(true)
                this.resolveReady = null
              }
            }, 2000)
          } else {
            console.log('No stockfish worker created')
            resolve(false)
          }
        } catch (e) {
          console.error('Stockfish init error:', e)
          resolve(false)
        }
      }
      
      script.onerror = (e) => {
        console.error('Failed to load Stockfish script:', e)
        resolve(false)
      }
      
      document.head.appendChild(script)
    })
  }

  start(fen: string, depth: number, skillLevel: number, onMove: (move: string) => void) {
    if (!this.worker || !this.ready) {
      console.log('Stockfish not ready, using fallback')
      return
    }

    console.log('Stockfish thinking... skill:', skillLevel, 'depth:', depth)
    
    // Set skill level
    this.worker.postMessage('setoption name Skill Level value ' + skillLevel)
    this.worker.postMessage('position fen ' + fen)
    this.worker.postMessage('go depth ' + depth)

    // Set up one-time message handler
    const handler = (msg: string) => {
      if (msg.startsWith('bestmove')) {
        const move = msg.split(' ')[1]
        if (move && move !== '(none)') {
          console.log('Stockfish move:', move)
          onMove(move)
        }
        // Remove handler after getting best move
        this.messageHandler = null
      }
    }
    this.messageHandler = handler
  }

  isReady(): boolean {
    return this.ready
  }
}

// Simple eval function
function simpleEval(fen: string): number {
  const pieces: Record<string, number> = {
    'P': 1, 'N': 3, 'B': 3, 'R': 5, 'Q': 9, 'K': 0,
    'p': -1, 'n': -3, 'b': -3, 'r': -5, 'q': -9, 'k': 0
  }
  let score = 0
  for (const ch of fen.split(' ')[0]) {
    if (pieces[ch] !== undefined) score += pieces[ch]
  }
  return score
}

// Generate valid Chess960 position using simple shuffle
function random960Position(): string {
  // Start with all 960 valid Chess960 starting positions
  // For simplicity, use a basic shuffle that ensures:
  // 1. King between rooks
  // 2. Bishops on opposite colors
  
  const backRank: string[] = Array(8).fill('')
  
  // Place bishops on opposite colors
  const darkSquares = [0, 2, 4, 6]
  const lightSquares = [1, 3, 5, 7]
  
  const darkBishop = darkSquares[Math.floor(Math.random() * darkSquares.length)]
  const lightBishop = lightSquares[Math.floor(Math.random() * lightSquares.length)]
  
  backRank[darkBishop] = 'b'
  backRank[lightBishop] = 'b'
  
  // Get remaining empty squares
  const empty = backRank.map((p, i) => p === '' ? i : -1).filter(i => i >= 0)
  
  // Place queen randomly in one of the remaining squares
  const queenPos = empty[Math.floor(Math.random() * empty.length)]
  backRank[queenPos] = 'q'
  
  // Get remaining empty squares (should be 5 left: 2 knights, 2 rooks, 1 king)
  const remaining = backRank.map((p, i) => p === '' ? i : -1).filter(i => i >= 0)
  
  // Place knights in 2 of the remaining squares
  const knight1 = remaining[Math.floor(Math.random() * remaining.length)]
  backRank[knight1] = 'n'
  
  const remainingAfterN1 = backRank.map((p, i) => p === '' ? i : -1).filter(i => i >= 0)
  const knight2 = remainingAfterN1[Math.floor(Math.random() * remainingAfterN1.length)]
  backRank[knight2] = 'n'
  
  // Now we have 3 empty squares left - must be R K R in that order
  const last3 = backRank.map((p, i) => p === '' ? i : -1).filter(i => i >= 0).sort((a, b) => a - b)
  
  if (last3.length === 3) {
    backRank[last3[0]] = 'r'
    backRank[last3[1]] = 'k'
    backRank[last3[2]] = 'r'
  }
  
  const fen = `${backRank.join('')}/pppppppp/8/8/8/8/PPPPPPPP/${backRank.join('').toUpperCase()} w KQkq - 0 1`
  return fen
}

// Fallback bot when Stockfish fails
function findFallbackMove(game: Chess): string {
  const moves = game.moves()
  if (moves.length === 0) return ''
  
  // Try to find a capture
  const captures = moves.filter((m: string) => m.includes('x'))
  if (captures.length > 0) {
    return captures[Math.floor(Math.random() * captures.length)]
  }
  
  // Otherwise random move
  return moves[Math.floor(Math.random() * moves.length)]
}

export default function ChessApp() {
  const [game, setGame] = useState(new Chess())
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [gameStatus, setGameStatus] = useState<'playing' | 'checkmate' | 'draw' | 'stalemate' | 'timeout' | 'resigned'>('playing')
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null)
  const [moveList, setMoveList] = useState<string[]>([])
  
  const [vsBot, setVsBot] = useState(false)
  const [bot, setBot] = useState<Bot>(BOTS[0])
  const [botThinking, setBotThinking] = useState(false)
  
  const [timeControl, setTimeControl] = useState(600)
  const [whiteTime, setWhiteTime] = useState(600)
  const [blackTime, setBlackTime] = useState(600)
  const [clockRunning, setClockRunning] = useState(false)
  
  const [analysisScore, setAnalysisScore] = useState<number | null>(null)
  
  const [showBots, setShowBots] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [variant, setVariant] = useState('chess')
  const [showResignMenu, setShowResignMenu] = useState(false)
  const [user, setUser] = useState<any>(null)

  const stockfishRef = useRef<StockfishEngine | null>(null)

  // Initialize Netlify Identity and Stockfish
  useEffect(() => {
    // Netlify Identity init
    if (typeof window !== 'undefined' && window.netlifyIdentity) {
      window.netlifyIdentity.on('login', (user: any) => {
        setUser(user)
        window.netlifyIdentity.close()
      })
      window.netlifyIdentity.on('logout', () => {
        setUser(null)
      })
      // Check if already logged in
      const currentUser = window.netlifyIdentity.currentUser()
      if (currentUser) setUser(currentUser)
    }
    
    // Stockfish init
    stockfishRef.current = new StockfishEngine()
    stockfishRef.current.init().then(ok => {
      console.log('Stockfish loaded:', ok)
    })
  }, [])

  // Clock tick
  useEffect(() => {
    if (!clockRunning || gameStatus !== 'playing') return
    const interval = setInterval(() => {
      if (game.turn() === 'w') {
        setWhiteTime(t => { 
          if (t <= 0) { setClockRunning(false); setGameStatus('timeout'); return 0 } 
          return t - 1 
        })
      } else {
        setBlackTime(t => { 
          if (t <= 0) { setClockRunning(false); setGameStatus('timeout'); return 0 } 
          return t - 1 
        })
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [clockRunning, game.turn(), gameStatus])

  // Check game over
  useEffect(() => {
    if (game.isCheckmate()) { setGameStatus('checkmate'); setClockRunning(false) }
    else if (game.isDraw()) { setGameStatus('draw'); setClockRunning(false) }
    else if (game.isStalemate()) { setGameStatus('stalemate'); setClockRunning(false) }
  }, [game])

  // Analysis - always active
  useEffect(() => {
    if (gameStatus === 'playing') {
      setAnalysisScore(simpleEval(game.fen()))
    }
  }, [game.fen(), gameStatus])

  // Bot move handler
  const handleBotMove = useCallback((move: string) => {
    if (!move) {
      setBotThinking(false)
      return
    }
    
    try {
      const newGame = new Chess(game.fen())
      const moveResult = newGame.move(move)
      
      if (moveResult) {
        setGame(newGame)
        setLastMove({ from: move.slice(0, 2), to: move.slice(2, 4) })
        setMoveList(m => [...m, moveResult.san])
      }
    } catch (e) {
      console.error('Bot move error:', e)
    }
    setBotThinking(false)
  }, [game])

  // Trigger bot move
  useEffect(() => {
    if (!vsBot || gameStatus !== 'playing' || botThinking) return
    
    const botColor = orientation === 'white' ? 'black' : 'white'
    const currentTurn = game.turn() === 'w' ? 'white' : 'black'
    
    if (currentTurn === botColor) {
      setBotThinking(true)
      
      // Small delay for visual feedback
      setTimeout(() => {
        const depth = Math.max(10, 20 - bot.skill * 0.3) // Higher skill = deeper search
        
        if (stockfishRef.current?.isReady()) {
          stockfishRef.current.start(game.fen(), Math.floor(depth), bot.skill, handleBotMove)
        } else {
          // Fallback if Stockfish not loaded
          const move = findFallbackMove(game)
          handleBotMove(move)
        }
      }, 200)
    }
  }, [game.fen(), vsBot, gameStatus, orientation, bot, botThinking, handleBotMove])

  // Handle player move
  const handleMove = useCallback((from: string, to: string, promotion?: string): boolean => {
    if (gameStatus !== 'playing') return false
    
    const newGame = new Chess(game.fen())
    const move = newGame.move({ from, to, promotion: promotion || 'q' })
    
    if (!move) return false
    
    setGame(newGame)
    setLastMove({ from, to })
    setMoveList(m => [...m, move.san])
    setClockRunning(true)
    
    return true
  }, [game, gameStatus])

  // New game
  const newGame = useCallback((botSelected?: Bot, newOrientation?: 'white' | 'black') => {
    let g: Chess
    
    if (variant === '960') {
      // Chess960 - random starting position
      g = new Chess(random960Position())
    } else {
      g = new Chess()
    }
    
    setGame(g)
    setMoveList([])
    setLastMove(null)
    setGameStatus('playing')
    setWhiteTime(timeControl)
    setBlackTime(timeControl)
    setClockRunning(false)
    setAnalysisScore(null)
    setShowResignMenu(false)
    
    if (newOrientation !== undefined) {
      setOrientation(newOrientation)
    }
    
    if (botSelected) {
      setBot(botSelected)
      setVsBot(true)
      setOrientation('white')
    } else {
      setVsBot(false)
    }
    
    setShowBots(false)
    setShowSettings(false)
  }, [variant, timeControl])

  // Resign
  const resign = useCallback(() => {
    setGameStatus('resigned')
    setClockRunning(false)
    setShowResignMenu(false)
  }, [])

  // Offer draw
  const offerDraw = useCallback(() => {
    setGameStatus('draw')
    setClockRunning(false)
  }, [])

  // Format time
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  // Get winner text
  const getWinnerText = () => {
    if (gameStatus === 'checkmate') {
      const winner = game.turn() === 'w' ? 'Black' : 'White'
      return `${winner} wins by checkmate!`
    }
    if (gameStatus === 'resigned') {
      const winner = game.turn() === 'w' ? 'Black' : 'White'
      return `${winner} wins - opponent resigned!`
    }
    if (gameStatus === 'timeout') {
      const winner = game.turn() === 'w' ? 'Black' : 'White'
      return `${winner} wins on time!`
    }
    if (gameStatus === 'draw') return 'Draw!'
    if (gameStatus === 'stalemate') return 'Stalemate!'
    return null
  }

  // Login screen
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white flex items-center justify-center">
        <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700 text-center max-w-md">
          <div className="text-6xl mb-4">♟️</div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent mb-2">
            ChessVerse
          </h1>
          <p className="text-slate-400 mb-6">Sign in to play chess against AI bots</p>
          <button 
            onClick={() => window.netlifyIdentity.open()}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-600 rounded-lg font-medium hover:from-amber-400 hover:to-orange-500"
          >
            Sign Up / Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">♟️</span>
            <h1 className="text-lg font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              ChessVerse
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="text-sm text-slate-400">{user.email}</span>
                <button 
                  onClick={() => window.netlifyIdentity.logout()}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm"
                >
                  <LogOut size={14} /> Logout
                </button>
              </>
            ) : (
              <button 
                onClick={() => window.netlifyIdentity.open()}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-lg text-sm"
              >
                <LogIn size={14} /> Login
              </button>
            )}
          </div>
          
          {gameStatus === 'playing' && (
            <div className="flex items-center gap-2">
              <button 
                onClick={offerDraw}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
              >
                <Hand size={14} /> Draw
              </button>
              <button 
                onClick={() => setShowResignMenu(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm"
              >
                <Flag size={14} /> Resign
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-3 p-3 max-w-7xl mx-auto">
        {/* Left Panel */}
        <aside className="lg:w-72 space-y-3">
          {/* Clock */}
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex justify-between items-center mb-3">
              <span className={`font-mono text-xl ${game.turn() === 'w' && gameStatus === 'playing' ? 'text-amber-400' : 'text-slate-400'}`}>
                {fmt(whiteTime)}
              </span>
              <div className="flex gap-1">
                <button onClick={() => setClockRunning(!clockRunning)} className="p-1.5 bg-slate-600 hover:bg-slate-500 rounded" disabled={gameStatus !== 'playing'}>
                  {clockRunning ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button onClick={() => newGame(vsBot ? bot : undefined)} className="p-1.5 bg-slate-600 hover:bg-slate-500 rounded">
                  <RotateCcw size={14} />
                </button>
              </div>
              <span className={`font-mono text-xl ${game.turn() === 'b' && gameStatus === 'playing' ? 'text-amber-400' : 'text-slate-400'}`}>
                {fmt(blackTime)}
              </span>
            </div>

            {gameStatus === 'playing' && (
              <div className="text-center text-amber-400 text-sm flex items-center justify-center gap-2">
                <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                {game.turn() === 'w' ? "White" : "Black"}'s Turn
                {botThinking && <span className="text-slate-400">(thinking...)</span>}
              </div>
            )}
            {gameStatus !== 'playing' && (
              <div className="text-center text-lg font-bold text-red-400">
                {getWinnerText()}
              </div>
            )}
          </div>

          {/* Bot Info */}
          {vsBot && (
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{bot.avatar}</span>
                <div>
                  <div className="font-bold">{bot.name}</div>
                  <div className="text-xs text-slate-400">Rating: {bot.rating}</div>
                </div>
              </div>
            </div>
          )}

          {/* Analysis */}
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold flex items-center gap-2 text-sm">
                <Brain size={14} className="text-amber-400" /> Position
              </span>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Advantage</span>
                <span className={`font-mono font-bold ${
                  analysisScore === null ? 'text-slate-400' :
                  analysisScore > 0.5 ? 'text-green-400' : 
                  analysisScore < -0.5 ? 'text-red-400' : 'text-yellow-400'
                }`}>
                  {analysisScore === null ? '...' : 
                   analysisScore > 0 ? `+${analysisScore.toFixed(1)}` : 
                   analysisScore.toFixed(1)}
                </span>
              </div>
              <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 transition-all"
                  style={{ 
                    width: analysisScore !== null 
                      ? `${Math.max(5, Math.min(95, 50 + analysisScore * 5))}%` 
                      : '50%' 
                  }} 
                />
              </div>
            </div>
          </div>

          {/* Moves */}
          <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 max-h-48 overflow-y-auto">
            <div className="font-bold text-sm mb-2 flex items-center gap-2">
              <Target size={14} className="text-amber-400" /> Moves
            </div>
            <div className="grid grid-cols-2 gap-1 text-xs font-mono">
              {moveList.map((m, i) => (
                <div key={i} className={`p-1 rounded ${i % 2 === 0 ? 'bg-slate-700/50' : 'bg-slate-700'}`}>
                  {Math.floor(i/2) + 1}.{m}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Board */}
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full h-full flex items-center justify-center">
            <ChessBoard
              position={game.fen()}
              orientation={orientation}
              onMove={handleMove}
              lastMove={lastMove}
            />
          </div>
        </main>

        {/* Right Panel */}
        <aside className="lg:w-64 space-y-3">
          {/* Quick Play */}
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="font-bold text-sm mb-3 flex items-center gap-2">
              <Zap size={14} className="text-amber-400" /> Quick Play
            </div>
            <div className="space-y-2">
              <button onClick={() => newGame()} className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 rounded-lg font-medium text-sm hover:from-amber-400 hover:to-orange-500">
                New Game
              </button>
              <button onClick={() => setShowBots(true)} className="w-full py-2.5 bg-slate-700 rounded-lg font-medium text-sm flex items-center justify-center gap-2">
                <Users size={14} /> Play vs Bot
              </button>
              <button 
                onClick={() => setOrientation(o => o === 'white' ? 'black' : 'white')}
                className="w-full py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm flex items-center justify-center gap-2"
              >
                <RotateCcw size={14} /> Flip Board
              </button>
            </div>
          </div>

          {/* Variants */}
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="font-bold text-sm mb-3 flex items-center gap-2">
              <Trophy size={14} className="text-amber-400" /> Variants
            </div>
            <div className="space-y-1">
              {[
                { id: 'chess', name: 'Classic', icon: '♟️' },
                { id: '960', name: 'Chess960', icon: '♜' },
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => { setVariant(v.id); newGame() }}
                  className={`w-full p-2 rounded-lg text-left text-sm flex items-center gap-2 ${
                    variant === v.id ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700/50 hover:bg-slate-700'
                  }`}
                >
                  <span>{v.icon}</span> {v.name}
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-sm">
            <div className="font-bold mb-2">Game Stats</div>
            <div className="space-y-1 text-slate-400">
              <div className="flex justify-between"><span>Moves</span><span>{moveList.length}</span></div>
              <div className="flex justify-between"><span>Captures</span><span>{game.history().filter(m => m.includes('x')).length}</span></div>
              <div className="flex justify-between"><span>Checks</span><span>{game.history().filter(m => m.includes('+')).length}</span></div>
            </div>
          </div>
        </aside>
      </div>

      {/* Bot Selection Modal */}
      {showBots && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-5 max-w-sm w-full border border-slate-600">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Users size={20} className="text-amber-400" /> Choose Opponent
            </h2>
            <div className="space-y-2">
              {BOTS.map(b => (
                <button
                  key={b.id}
                  onClick={() => newGame(b)}
                  className="w-full p-3 bg-slate-700 hover:bg-slate-600 rounded-xl flex items-center gap-3 text-left"
                >
                  <span className="text-2xl">{b.avatar}</span>
                  <div className="flex-1">
                    <div className="font-bold">{b.name}</div>
                    <div className="text-xs text-slate-400">{b.desc}</div>
                  </div>
                  <span className="text-amber-400 text-sm">{b.rating}</span>
                  <ChevronRight size={16} className="text-slate-500" />
                </button>
              ))}
            </div>
            <button onClick={() => setShowBots(false)} className="w-full mt-3 p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Resign Confirmation */}
      {showResignMenu && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-5 max-w-sm w-full border border-slate-600">
            <h2 className="text-xl font-bold mb-4 text-red-400">Resign Game?</h2>
            <p className="text-slate-300 mb-4">Are you sure you want to resign? This will count as a loss.</p>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowResignMenu(false)}
                className="flex-1 p-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={resign}
                className="flex-1 p-3 bg-red-600 hover:bg-red-500 rounded-lg font-medium"
              >
                Resign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
