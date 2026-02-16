'use client'

import { useState, useCallback, useEffect, ReactNode } from 'react'
import { Chess, Square } from 'chess.js'

// Unicode chess pieces
const PIECES: Record<string, string> = {
  'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔',
  'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚'
}

const ROWS = ['8', '7', '6', '5', '4', '3', '2', '1']
const COLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

interface ChessBoardProps {
  position: string
  orientation: 'white' | 'black'
  onMove: (from: string, to: string, promotion?: string) => boolean
  lastMove?: { from: string; to: string } | null
  highlightedSquares?: string[]
}

export function ChessBoard({ 
  position, 
  orientation, 
  onMove, 
  lastMove,
  highlightedSquares = []
}: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [possibleMoves, setPossibleMoves] = useState<string[]>([])

  const game = new Chess(position)

  // Get piece at a square
  const getPiece = useCallback((square: string): { type: string; color: 'w' | 'b' } | null => {
    const piece = game.get(square as Square)
    return piece ? { type: piece.type, color: piece.color } : null
  }, [position])

  // Get legal moves for a square
  const getLegalMoves = useCallback((square: string): string[] => {
    const moves = game.moves({ square: square as Square, verbose: true })
    return moves.map((m: any) => m.to)
  }, [position])

  // Handle square click
  const handleSquareClick = useCallback((square: string) => {
    // If we have a selected square, try to move
    if (selectedSquare) {
      const moves = getLegalMoves(selectedSquare)
      if (moves.includes(square)) {
        const success = onMove(selectedSquare, square, 'q')
        if (success) {
          setSelectedSquare(null)
          setPossibleMoves([])
          return
        }
      }
    }

    // Select new square if it has a piece
    const piece = getPiece(square)
    if (piece) {
      const isMyPiece = (orientation === 'white' && piece.color === 'w') ||
                       (orientation === 'black' && piece.color === 'b')
      if (isMyPiece) {
        setSelectedSquare(square)
        setPossibleMoves(getLegalMoves(square))
        return
      }
    }

    // Deselect
    setSelectedSquare(null)
    setPossibleMoves([])
  }, [selectedSquare, orientation, getPiece, getLegalMoves, onMove])

  // Reset selection when position changes
  useEffect(() => {
    setSelectedSquare(null)
    setPossibleMoves([])
  }, [position])

  // Build board squares
  const squares: ReactNode[] = []
  const board = orientation === 'white' 
    ? ROWS.flatMap((row, ri) => COLS.map((col, ci) => ({ row, col, ri, ci })))
    : ROWS.slice().reverse().flatMap((row, ri) => COLS.slice().reverse().map((col, ci) => ({ row, col, ri, ci })))

  for (const { row, col, ri, ci } of board) {
    const square = col + row
    const isDark = (ri + ci) % 2 === 1
    const piece = getPiece(square)
    const isSelected = selectedSquare === square
    const isPossibleMove = possibleMoves.includes(square)
    const isLastMove = lastMove?.from === square || lastMove?.to === square

    let bgClass = isDark ? 'bg-[#3d3a2d]' : 'bg-[#ebe5ce]'
    if (isSelected) bgClass = 'bg-amber-400'
    else if (isPossibleMove) bgClass = isDark ? 'bg-[#5a5a3d]' : 'bg-[#d5d5b0]'
    else if (isLastMove) bgClass = isDark ? 'bg-amber-700/50' : 'bg-amber-300/50'

    squares.push(
      <div
        key={square}
        onClick={() => handleSquareClick(square)}
        className={`
          ${bgClass} 
          aspect-square flex items-center justify-center 
          text-5xl sm:text-6xl md:text-7xl lg:text-8xl cursor-pointer
          select-none transition-colors duration-150
          relative
          ${isPossibleMove ? 'after:absolute after:w-5 after:h-5 after:rounded-full after:bg-black/40' : ''}
        `}
        style={{
          boxShadow: isSelected ? 'inset 0 0 0 3px #f59e0b' : 'none'
        }}
      >
        {piece && (
          <span className={`
            ${piece.color === 'w' ? 'text-white drop-shadow-md' : 'text-black'}
            font-bold text-[5rem] md:text-[6rem] lg:text-[7rem] -mt-2
          `}>
            {PIECES[piece.type]}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="w-full h-full max-w-[800px] aspect-square">
      <div className="w-full h-full grid grid-cols-8 grid-rows-8 border-4 border-[#5a5a3d] rounded-lg overflow-hidden shadow-2xl">
        {squares}
      </div>
    </div>
  )
}
