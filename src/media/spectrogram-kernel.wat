;; One analysis frame of a spectrogram: window, FFT, power, and decibels, four
;; values per instruction where the data lies in a row. Compiled into
;; src/generated/spectrogram-kernel.ts by `npm run kernel:build`.
;;
;; A frame of `size` real samples is transformed as a complex one of half the
;; size — even samples real, odd ones imaginary — and the two halves are taken
;; apart afterwards. Memory holds the regions `setup` lays out for `size`: the
;; frame the caller writes its samples to, the window, the real and imaginary
;; parts, the bit-reversed order, the butterfly twiddles of every stage, the
;; twiddles that take the halves apart, and the decibel levels `analyse`
;; writes. The caller fills every table but the parts.
(module
	(memory (export "memory") 1)
	(global $size (mut i32) (i32.const 0))
	(global $half (mut i32) (i32.const 0))
	(global $window (mut i32) (i32.const 0))
	(global $real (mut i32) (i32.const 0))
	(global $imag (mut i32) (i32.const 0))
	(global $reversed (mut i32) (i32.const 0))
	(global $cos (mut i32) (i32.const 0))
	(global $sin (mut i32) (i32.const 0))
	(global $splitCos (mut i32) (i32.const 0))
	(global $splitSin (mut i32) (i32.const 0))
	(global $levels (mut i32) (i32.const 0))

	;; Lays the regions out for frames of `size` samples, a power of two of at
	;; least 16; see `SpectrogramKernel` for the same layout in bytes.
	(func (export "setup") (param $size i32)
		(local $bins i32)
		(global.set $size (local.get $size))
		(global.set $half (i32.shr_u (local.get $size) (i32.const 1)))
		(local.set $bins (i32.add (global.get $half) (i32.const 4)))
		(global.set $window (i32.mul (local.get $size) (i32.const 4)))
		(global.set $real (i32.mul (local.get $size) (i32.const 8)))
		(global.set $imag (i32.mul (local.get $size) (i32.const 10)))
		(global.set $reversed (i32.mul (local.get $size) (i32.const 12)))
		(global.set $cos (i32.mul (local.get $size) (i32.const 14)))
		(global.set $sin (i32.mul (local.get $size) (i32.const 16)))
		(global.set $splitCos (i32.mul (local.get $size) (i32.const 18)))
		(global.set $splitSin
			(i32.add (global.get $splitCos) (i32.mul (local.get $bins) (i32.const 4))))
		(global.set $levels
			(i32.add (global.get $splitSin) (i32.mul (local.get $bins) (i32.const 4)))))

	;; Windows the frame into the real and imaginary parts, its even samples
	;; real and its odd ones imaginary.
	(func $pack
		(local $source i32) (local $target i32) (local $end i32)
		(local $first v128) (local $second v128)
		(local.set $end (i32.mul (global.get $size) (i32.const 4)))
		(block $done
			(loop $samples
				(br_if $done (i32.ge_u (local.get $source) (local.get $end)))
				(local.set $first
					(f32x4.mul
						(v128.load (local.get $source))
						(v128.load (i32.add (global.get $window) (local.get $source)))))
				(local.set $second
					(f32x4.mul
						(v128.load offset=16 (local.get $source))
						(v128.load offset=16 (i32.add (global.get $window) (local.get $source)))))
				(v128.store (i32.add (global.get $real) (local.get $target))
					(i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
						(local.get $first) (local.get $second)))
				(v128.store (i32.add (global.get $imag) (local.get $target))
					(i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
						(local.get $first) (local.get $second)))
				(local.set $source (i32.add (local.get $source) (i32.const 32)))
				(local.set $target (i32.add (local.get $target) (i32.const 16)))
				(br $samples))))

	;; Puts the parts in bit-reversed order, which the butterflies undo.
	(func $reorder
		(local $index i32) (local $other i32) (local $a i32) (local $b i32)
		(local $value f32)
		(block $done
			(loop $entries
				(br_if $done (i32.ge_u (local.get $index) (global.get $half)))
				(local.set $other
					(i32.load
						(i32.add (global.get $reversed) (i32.shl (local.get $index) (i32.const 2)))))
				(if (i32.gt_u (local.get $other) (local.get $index))
					(then
						(local.set $a (i32.shl (local.get $index) (i32.const 2)))
						(local.set $b (i32.shl (local.get $other) (i32.const 2)))
						(local.set $value (f32.load (i32.add (global.get $real) (local.get $a))))
						(f32.store (i32.add (global.get $real) (local.get $a))
							(f32.load (i32.add (global.get $real) (local.get $b))))
						(f32.store (i32.add (global.get $real) (local.get $b)) (local.get $value))
						(local.set $value (f32.load (i32.add (global.get $imag) (local.get $a))))
						(f32.store (i32.add (global.get $imag) (local.get $a))
							(f32.load (i32.add (global.get $imag) (local.get $b))))
						(f32.store (i32.add (global.get $imag) (local.get $b)) (local.get $value))))
				(local.set $index (i32.add (local.get $index) (i32.const 1)))
				(br $entries))))

	;; The butterflies of the stages whose blocks span fewer than four pairs,
	;; one pair at a time. The twiddles of the stage that pairs entries `span`
	;; apart start at entry `span - 1` of the twiddle tables.
	(func $narrowStage (param $span i32)
		(local $start i32) (local $offset i32) (local $even i32) (local $odd i32)
		(local $twiddle i32) (local $wr f32) (local $wi f32) (local $tr f32) (local $ti f32)
		(local $or f32) (local $oi f32)
		(block $blocks_done
			(loop $blocks
				(br_if $blocks_done (i32.ge_u (local.get $start) (global.get $half)))
				(local.set $offset (i32.const 0))
				(block $pairs_done
					(loop $pairs
						(br_if $pairs_done (i32.ge_u (local.get $offset) (local.get $span)))
						(local.set $twiddle
							(i32.shl
								(i32.add (i32.sub (local.get $span) (i32.const 1)) (local.get $offset))
								(i32.const 2)))
						(local.set $wr (f32.load (i32.add (global.get $cos) (local.get $twiddle))))
						(local.set $wi (f32.load (i32.add (global.get $sin) (local.get $twiddle))))
						(local.set $even
							(i32.shl (i32.add (local.get $start) (local.get $offset)) (i32.const 2)))
						(local.set $odd
							(i32.add (local.get $even) (i32.shl (local.get $span) (i32.const 2))))
						(local.set $or (f32.load (i32.add (global.get $real) (local.get $odd))))
						(local.set $oi (f32.load (i32.add (global.get $imag) (local.get $odd))))
						(local.set $tr
							(f32.sub (f32.mul (local.get $or) (local.get $wr))
								(f32.mul (local.get $oi) (local.get $wi))))
						(local.set $ti
							(f32.add (f32.mul (local.get $or) (local.get $wi))
								(f32.mul (local.get $oi) (local.get $wr))))
						(f32.store (i32.add (global.get $real) (local.get $odd))
							(f32.sub (f32.load (i32.add (global.get $real) (local.get $even)))
								(local.get $tr)))
						(f32.store (i32.add (global.get $imag) (local.get $odd))
							(f32.sub (f32.load (i32.add (global.get $imag) (local.get $even)))
								(local.get $ti)))
						(f32.store (i32.add (global.get $real) (local.get $even))
							(f32.add (f32.load (i32.add (global.get $real) (local.get $even)))
								(local.get $tr)))
						(f32.store (i32.add (global.get $imag) (local.get $even))
							(f32.add (f32.load (i32.add (global.get $imag) (local.get $even)))
								(local.get $ti)))
						(local.set $offset (i32.add (local.get $offset) (i32.const 1)))
						(br $pairs)))
				(local.set $start
					(i32.add (local.get $start) (i32.shl (local.get $span) (i32.const 1))))
				(br $blocks))))

	;; The butterflies of a stage whose blocks span four pairs or more, four
	;; pairs at a time.
	(func $wideStage (param $span i32)
		(local $start i32) (local $offset i32) (local $even i32) (local $odd i32)
		(local $twiddle i32) (local $wr v128) (local $wi v128) (local $tr v128) (local $ti v128)
		(local $or v128) (local $oi v128) (local $er v128) (local $ei v128)
		(block $blocks_done
			(loop $blocks
				(br_if $blocks_done (i32.ge_u (local.get $start) (global.get $half)))
				(local.set $offset (i32.const 0))
				(block $pairs_done
					(loop $pairs
						(br_if $pairs_done (i32.ge_u (local.get $offset) (local.get $span)))
						(local.set $twiddle
							(i32.shl
								(i32.add (i32.sub (local.get $span) (i32.const 1)) (local.get $offset))
								(i32.const 2)))
						(local.set $wr (v128.load (i32.add (global.get $cos) (local.get $twiddle))))
						(local.set $wi (v128.load (i32.add (global.get $sin) (local.get $twiddle))))
						(local.set $even
							(i32.shl (i32.add (local.get $start) (local.get $offset)) (i32.const 2)))
						(local.set $odd
							(i32.add (local.get $even) (i32.shl (local.get $span) (i32.const 2))))
						(local.set $or (v128.load (i32.add (global.get $real) (local.get $odd))))
						(local.set $oi (v128.load (i32.add (global.get $imag) (local.get $odd))))
						(local.set $er (v128.load (i32.add (global.get $real) (local.get $even))))
						(local.set $ei (v128.load (i32.add (global.get $imag) (local.get $even))))
						(local.set $tr
							(f32x4.sub (f32x4.mul (local.get $or) (local.get $wr))
								(f32x4.mul (local.get $oi) (local.get $wi))))
						(local.set $ti
							(f32x4.add (f32x4.mul (local.get $or) (local.get $wi))
								(f32x4.mul (local.get $oi) (local.get $wr))))
						(v128.store (i32.add (global.get $real) (local.get $odd))
							(f32x4.sub (local.get $er) (local.get $tr)))
						(v128.store (i32.add (global.get $imag) (local.get $odd))
							(f32x4.sub (local.get $ei) (local.get $ti)))
						(v128.store (i32.add (global.get $real) (local.get $even))
							(f32x4.add (local.get $er) (local.get $tr)))
						(v128.store (i32.add (global.get $imag) (local.get $even))
							(f32x4.add (local.get $ei) (local.get $ti)))
						(local.set $offset (i32.add (local.get $offset) (i32.const 4)))
						(br $pairs)))
				(local.set $start
					(i32.add (local.get $start) (i32.shl (local.get $span) (i32.const 1))))
				(br $blocks))))

	;; Decibels of a power, from the bits of the float: its exponent, and an
	;; odd series in (m - 1) / (m + 1) for its mantissa m, which is within a
	;; thousandth of a decibel. Zero comes out far below anything shown.
	(func $decibels (param $power f32) (result f32)
		(local $bits i32) (local $mantissa f32) (local $t f32) (local $t2 f32)
		(local.set $bits (i32.reinterpret_f32 (local.get $power)))
		(local.set $mantissa
			(f32.reinterpret_i32
				(i32.or (i32.and (local.get $bits) (i32.const 0x7fffff)) (i32.const 0x3f800000))))
		(local.set $t
			(f32.div (f32.sub (local.get $mantissa) (f32.const 1))
				(f32.add (local.get $mantissa) (f32.const 1))))
		(local.set $t2 (f32.mul (local.get $t) (local.get $t)))
		;; 10 · log10(2) · log2(power)
		(f32.mul (f32.const 3.0102999566)
			(f32.add
				(f32.convert_i32_s
					(i32.sub (i32.shr_u (local.get $bits) (i32.const 23)) (i32.const 127)))
				(f32.mul (f32.const 2.8853900818)
					(f32.mul (local.get $t)
						(f32.add (f32.const 1)
							(f32.mul (local.get $t2)
								(f32.add (f32.const 0.33333333)
									(f32.mul (local.get $t2) (f32.const 0.2))))))))))

	;; Analyses the frame and writes the level of its first `bins` bins, a byte
	;; each: 255 at full scale, one step per half decibel below. `scale` takes
	;; a bin's squared magnitude to the power of a sine in it.
	(func (export "analyse") (param $scale f32) (param $bins i32)
		(local $span i32) (local $bin i32) (local $k i32) (local $mirror i32)
		(local $ar f32) (local $ai f32) (local $br f32) (local $bi f32)
		(local $evenR f32) (local $evenI f32) (local $oddR f32) (local $oddI f32)
		(local $wr f32) (local $wi f32) (local $xr f32) (local $xi f32) (local $level f32)
		(call $pack)
		(call $reorder)
		(local.set $span (i32.const 1))
		(block $stages_done
			(loop $stages
				(br_if $stages_done (i32.ge_u (local.get $span) (global.get $half)))
				(if (i32.lt_u (local.get $span) (i32.const 4))
					(then (call $narrowStage (local.get $span)))
					(else (call $wideStage (local.get $span))))
				(local.set $span (i32.shl (local.get $span) (i32.const 1)))
				(br $stages)))

		(block $bins_done
			(loop $each_bin
				(br_if $bins_done (i32.ge_u (local.get $bin) (local.get $bins)))
				(local.set $k
					(i32.shl (i32.rem_u (local.get $bin) (global.get $half)) (i32.const 2)))
				(local.set $mirror
					(i32.shl
						(i32.rem_u (i32.sub (global.get $half) (local.get $bin)) (global.get $half))
						(i32.const 2)))
				(local.set $ar (f32.load (i32.add (global.get $real) (local.get $k))))
				(local.set $ai (f32.load (i32.add (global.get $imag) (local.get $k))))
				(local.set $br (f32.load (i32.add (global.get $real) (local.get $mirror))))
				(local.set $bi (f32.neg (f32.load (i32.add (global.get $imag) (local.get $mirror)))))
				(local.set $evenR (f32.mul (f32.add (local.get $ar) (local.get $br)) (f32.const 0.5)))
				(local.set $evenI (f32.mul (f32.add (local.get $ai) (local.get $bi)) (f32.const 0.5)))
				(local.set $oddR (f32.mul (f32.sub (local.get $ai) (local.get $bi)) (f32.const 0.5)))
				(local.set $oddI (f32.mul (f32.sub (local.get $br) (local.get $ar)) (f32.const 0.5)))
				(local.set $wr
					(f32.load (i32.add (global.get $splitCos) (i32.shl (local.get $bin) (i32.const 2)))))
				(local.set $wi
					(f32.load (i32.add (global.get $splitSin) (i32.shl (local.get $bin) (i32.const 2)))))
				(local.set $xr
					(f32.add (local.get $evenR)
						(f32.sub (f32.mul (local.get $wr) (local.get $oddR))
							(f32.mul (local.get $wi) (local.get $oddI)))))
				(local.set $xi
					(f32.add (local.get $evenI)
						(f32.add (f32.mul (local.get $wr) (local.get $oddI))
							(f32.mul (local.get $wi) (local.get $oddR)))))
				(local.set $level
					(f32.nearest
						(f32.add (f32.const 255)
							(f32.mul (f32.const 2)
								(call $decibels
									(f32.mul (local.get $scale)
										(f32.add (f32.mul (local.get $xr) (local.get $xr))
											(f32.mul (local.get $xi) (local.get $xi)))))))))
				(i32.store8 (i32.add (global.get $levels) (local.get $bin))
					(i32.trunc_sat_f32_s
						(f32.max (f32.const 0) (f32.min (f32.const 255) (local.get $level)))))
				(local.set $bin (i32.add (local.get $bin) (i32.const 1)))
				(br $each_bin)))))
