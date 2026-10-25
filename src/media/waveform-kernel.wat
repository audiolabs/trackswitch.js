;; The sample loops behind waveform summaries and mixes, four samples per
;; instruction. Compiled into src/generated/waveform-kernel.ts by
;; `npm run kernel:build`.
;;
;; Memory holds five regions, laid out by `setup` for chunks of up to `chunk`
;; samples: the accumulator a chunk is mixed into, the input a channel is
;; copied into before it is added, the min/max pairs `reduce` writes, the
;; 16-bit samples `accumulate16` reads and `compact` writes, and the coarser
;; levels of pairs `coarsen` writes, whose layout the caller chooses.
(module
	(memory (export "memory") 1)
	(global $input (mut i32) (i32.const 0))
	(global $output (mut i32) (i32.const 0))
	(global $input16 (mut i32) (i32.const 0))

	(func (export "setup") (param $chunk i32)
		(global.set $input (i32.mul (local.get $chunk) (i32.const 4)))
		(global.set $output (i32.mul (local.get $chunk) (i32.const 8)))
		(global.set $input16
			(i32.add
				(i32.mul (local.get $chunk) (i32.const 8))
				(i32.shr_u (local.get $chunk) (i32.const 1)))))

	;; Zeroes the first `count` samples of the accumulator.
	(func (export "clear") (param $count i32)
		(memory.fill (i32.const 0) (i32.const 0) (i32.mul (local.get $count) (i32.const 4))))

	;; Adds `gain` times the first `count` input samples to the accumulator from
	;; sample `offset` on.
	(func (export "accumulate") (param $offset i32) (param $count i32) (param $gain f32)
		(local $target i32) (local $source i32) (local $end i32) (local $gains v128)
		(local.set $gains (f32x4.splat (local.get $gain)))
		(local.set $target (i32.mul (local.get $offset) (i32.const 4)))
		(local.set $source (global.get $input))
		(local.set $end
			(i32.add (global.get $input)
				(i32.mul (i32.and (local.get $count) (i32.const -4)) (i32.const 4))))
		(block $vectors_done
			(loop $vectors
				(br_if $vectors_done (i32.ge_u (local.get $source) (local.get $end)))
				(v128.store (local.get $target)
					(f32x4.add
						(v128.load (local.get $target))
						(f32x4.mul (v128.load (local.get $source)) (local.get $gains))))
				(local.set $target (i32.add (local.get $target) (i32.const 16)))
				(local.set $source (i32.add (local.get $source) (i32.const 16)))
				(br $vectors)))
		(local.set $end
			(i32.add (global.get $input) (i32.mul (local.get $count) (i32.const 4))))
		(block $tail_done
			(loop $tail
				(br_if $tail_done (i32.ge_u (local.get $source) (local.get $end)))
				(f32.store (local.get $target)
					(f32.add
						(f32.load (local.get $target))
						(f32.mul (f32.load (local.get $source)) (local.get $gain))))
				(local.set $target (i32.add (local.get $target) (i32.const 4)))
				(local.set $source (i32.add (local.get $source) (i32.const 4)))
				(br $tail))))

;; Adds `gain` times the first `count` 16-bit samples to the accumulator from
	;; sample `offset` on.
	(func (export "accumulate16") (param $offset i32) (param $count i32) (param $gain f32)
		(local $target i32) (local $source i32) (local $end i32) (local $gains v128)
		(local $values v128)
		(local.set $gains (f32x4.splat (local.get $gain)))
		(local.set $target (i32.mul (local.get $offset) (i32.const 4)))
		(local.set $source (global.get $input16))
		(local.set $end
			(i32.add (global.get $input16)
				(i32.mul (i32.and (local.get $count) (i32.const -8)) (i32.const 2))))
		(block $vectors_done
			(loop $vectors
				(br_if $vectors_done (i32.ge_u (local.get $source) (local.get $end)))
				(local.set $values (v128.load (local.get $source)))
				(v128.store (local.get $target)
					(f32x4.add
						(v128.load (local.get $target))
						(f32x4.mul
							(f32x4.convert_i32x4_s (i32x4.extend_low_i16x8_s (local.get $values)))
							(local.get $gains))))
				(v128.store offset=16 (local.get $target)
					(f32x4.add
						(v128.load offset=16 (local.get $target))
						(f32x4.mul
							(f32x4.convert_i32x4_s (i32x4.extend_high_i16x8_s (local.get $values)))
							(local.get $gains))))
				(local.set $target (i32.add (local.get $target) (i32.const 32)))
				(local.set $source (i32.add (local.get $source) (i32.const 16)))
				(br $vectors)))
		(local.set $end
			(i32.add (global.get $input16) (i32.mul (local.get $count) (i32.const 2))))
		(block $tail_done
			(loop $tail
				(br_if $tail_done (i32.ge_u (local.get $source) (local.get $end)))
				(f32.store (local.get $target)
					(f32.add
						(f32.load (local.get $target))
						(f32.mul
							(f32.convert_i32_s (i32.load16_s (local.get $source)))
							(local.get $gain))))
				(local.set $target (i32.add (local.get $target) (i32.const 4)))
				(local.set $source (i32.add (local.get $source) (i32.const 2)))
				(br $tail))))

	;; Writes the first `count` accumulator samples as 16-bit samples, scaled so
	;; the loudest of them reaches full scale, and returns that loudest one's
	;; magnitude — the factor that takes them back, times 32767.
	(func (export "compact") (param $count i32) (result f32)
		(local $sample i32) (local $target i32) (local $end i32)
		(local $peaks v128) (local $scales v128) (local $peak f32) (local $scale f32)
		(local.set $end
			(i32.mul (i32.and (local.get $count) (i32.const -4)) (i32.const 4)))
		(block $peak_vectors_done
			(loop $peak_vectors
				(br_if $peak_vectors_done (i32.ge_u (local.get $sample) (local.get $end)))
				(local.set $peaks
					(f32x4.max (local.get $peaks) (f32x4.abs (v128.load (local.get $sample)))))
				(local.set $sample (i32.add (local.get $sample) (i32.const 16)))
				(br $peak_vectors)))
		(local.set $peak
			(f32.max
				(f32.max
					(f32x4.extract_lane 0 (local.get $peaks))
					(f32x4.extract_lane 1 (local.get $peaks)))
				(f32.max
					(f32x4.extract_lane 2 (local.get $peaks))
					(f32x4.extract_lane 3 (local.get $peaks)))))
		(local.set $end (i32.mul (local.get $count) (i32.const 4)))
		(block $peak_tail_done
			(loop $peak_tail
				(br_if $peak_tail_done (i32.ge_u (local.get $sample) (local.get $end)))
				(local.set $peak
					(f32.max (local.get $peak) (f32.abs (f32.load (local.get $sample)))))
				(local.set $sample (i32.add (local.get $sample) (i32.const 4)))
				(br $peak_tail)))

		(local.set $scale
			(select
				(f32.div (f32.const 32767) (local.get $peak))
				(f32.const 0)
				(f32.gt (local.get $peak) (f32.const 0))))
		(local.set $scales (f32x4.splat (local.get $scale)))
		(local.set $sample (i32.const 0))
		(local.set $target (global.get $input16))
		(local.set $end
			(i32.mul (i32.and (local.get $count) (i32.const -8)) (i32.const 4)))
		(block $vectors_done
			(loop $vectors
				(br_if $vectors_done (i32.ge_u (local.get $sample) (local.get $end)))
				(v128.store (local.get $target)
					(i16x8.narrow_i32x4_s
						(i32x4.trunc_sat_f32x4_s
							(f32x4.nearest
								(f32x4.mul (v128.load (local.get $sample)) (local.get $scales))))
						(i32x4.trunc_sat_f32x4_s
							(f32x4.nearest
								(f32x4.mul
									(v128.load offset=16 (local.get $sample))
									(local.get $scales))))))
				(local.set $sample (i32.add (local.get $sample) (i32.const 32)))
				(local.set $target (i32.add (local.get $target) (i32.const 16)))
				(br $vectors)))
		(local.set $end (i32.mul (local.get $count) (i32.const 4)))
		(block $tail_done
			(loop $tail
				(br_if $tail_done (i32.ge_u (local.get $sample) (local.get $end)))
				(i32.store16 (local.get $target)
					(i32.trunc_sat_f32_s
						(f32.nearest
							(f32.mul (f32.load (local.get $sample)) (local.get $scale)))))
				(local.set $sample (i32.add (local.get $sample) (i32.const 4)))
				(local.set $target (i32.add (local.get $target) (i32.const 2)))
				(br $tail)))
		(local.get $peak))

	;; Writes the min/max pair of every 16 accumulator samples among the first
	;; `count`, the last block taking whatever is left.
	(func (export "reduce") (param $count i32)
		(local $sample i32) (local $pair i32) (local $end i32)
		(local $mins v128) (local $maxes v128) (local $values v128)
		(local $value f32) (local $min f32) (local $max f32)
		(local.set $pair (global.get $output))
		(local.set $end
			(i32.mul (i32.and (local.get $count) (i32.const -16)) (i32.const 4)))
		(block $blocks_done
			(loop $blocks
				(br_if $blocks_done (i32.ge_u (local.get $sample) (local.get $end)))
				(local.set $mins (v128.load (local.get $sample)))
				(local.set $maxes (local.get $mins))
				(local.set $values (v128.load offset=16 (local.get $sample)))
				(local.set $mins (f32x4.pmin (local.get $mins) (local.get $values)))
				(local.set $maxes (f32x4.pmax (local.get $maxes) (local.get $values)))
				(local.set $values (v128.load offset=32 (local.get $sample)))
				(local.set $mins (f32x4.pmin (local.get $mins) (local.get $values)))
				(local.set $maxes (f32x4.pmax (local.get $maxes) (local.get $values)))
				(local.set $values (v128.load offset=48 (local.get $sample)))
				(local.set $mins (f32x4.pmin (local.get $mins) (local.get $values)))
				(local.set $maxes (f32x4.pmax (local.get $maxes) (local.get $values)))
				(f32.store (local.get $pair)
					(f32.min
						(f32.min
							(f32x4.extract_lane 0 (local.get $mins))
							(f32x4.extract_lane 1 (local.get $mins)))
						(f32.min
							(f32x4.extract_lane 2 (local.get $mins))
							(f32x4.extract_lane 3 (local.get $mins)))))
				(f32.store offset=4 (local.get $pair)
					(f32.max
						(f32.max
							(f32x4.extract_lane 0 (local.get $maxes))
							(f32x4.extract_lane 1 (local.get $maxes)))
						(f32.max
							(f32x4.extract_lane 2 (local.get $maxes))
							(f32x4.extract_lane 3 (local.get $maxes)))))
				(local.set $sample (i32.add (local.get $sample) (i32.const 64)))
				(local.set $pair (i32.add (local.get $pair) (i32.const 8)))
				(br $blocks)))
		(local.set $end (i32.mul (local.get $count) (i32.const 4)))
		(if (i32.lt_u (local.get $sample) (local.get $end))
			(then
				(local.set $min (f32.load (local.get $sample)))
				(local.set $max (local.get $min))
				(block $tail_done
					(loop $tail
						(local.set $sample (i32.add (local.get $sample) (i32.const 4)))
						(br_if $tail_done (i32.ge_u (local.get $sample) (local.get $end)))
						(local.set $value (f32.load (local.get $sample)))
						(local.set $min (f32.min (local.get $min) (local.get $value)))
						(local.set $max (f32.max (local.get $max) (local.get $value)))
						(br $tail)))
				(f32.store (local.get $pair) (local.get $min))
				(f32.store offset=4 (local.get $pair) (local.get $max)))))

	;; Writes one min/max pair for every four of the `count` pairs at byte
	;; `source` to byte `target`, the last pair covering whatever is left.
	(func (export "coarsen") (param $count i32) (param $source i32) (param $target i32)
		(local $end i32) (local $mins v128) (local $maxes v128)
		(local $first v128) (local $second v128) (local $min f32) (local $max f32)
		(local.set $end
			(i32.add (local.get $source)
				(i32.mul (i32.and (local.get $count) (i32.const -4)) (i32.const 8))))
		(block $groups_done
			(loop $groups
				(br_if $groups_done (i32.ge_u (local.get $source) (local.get $end)))
				(local.set $first (v128.load (local.get $source)))
				(local.set $second (v128.load offset=16 (local.get $source)))
				(local.set $mins (f32x4.min (local.get $first) (local.get $second)))
				(local.set $maxes (f32x4.max (local.get $first) (local.get $second)))
				(f32.store (local.get $target)
					(f32.min
						(f32x4.extract_lane 0 (local.get $mins))
						(f32x4.extract_lane 2 (local.get $mins))))
				(f32.store offset=4 (local.get $target)
					(f32.max
						(f32x4.extract_lane 1 (local.get $maxes))
						(f32x4.extract_lane 3 (local.get $maxes))))
				(local.set $source (i32.add (local.get $source) (i32.const 32)))
				(local.set $target (i32.add (local.get $target) (i32.const 8)))
				(br $groups)))
		(local.set $end
			(i32.add (local.get $end)
				(i32.mul (i32.and (local.get $count) (i32.const 3)) (i32.const 8))))
		(if (i32.lt_u (local.get $source) (local.get $end))
			(then
				(local.set $min (f32.load (local.get $source)))
				(local.set $max (f32.load offset=4 (local.get $source)))
				(block $tail_done
					(loop $tail
						(local.set $source (i32.add (local.get $source) (i32.const 8)))
						(br_if $tail_done (i32.ge_u (local.get $source) (local.get $end)))
						(local.set $min (f32.min (local.get $min) (f32.load (local.get $source))))
						(local.set $max
							(f32.max (local.get $max) (f32.load offset=4 (local.get $source))))
						(br $tail)))
				(f32.store (local.get $target) (local.get $min))
				(f32.store offset=4 (local.get $target) (local.get $max))))))
