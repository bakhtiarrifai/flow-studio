#!/usr/bin/env python3
"""Royalty-free Middle-Eastern ambient bed for kids' Islamic shorts, made from scratch (no samples, no API).
Usage: python3 backsound.py <out.wav> [seconds]
Soft D-Hijaz drone (pitched high enough for phone speakers), oud-like plucks on a slow stepwise melody and a gentle
duff (frame drum) pattern; 0.6 s fades at both ends so it loops without a click."""
import sys
import numpy as np
from scipy.io import wavfile
sr=44100; dur=float(sys.argv[2]) if len(sys.argv) > 2 else 36.0; n=int(sr*dur); t=np.arange(n)/sr
rng=np.random.default_rng(5)
# Hijaz on D: D Eb F# G A Bb C D
hz=lambda semis: 146.83*2**(semis/12)
scale=[0,1,4,5,7,8,10,12,13,16,17]
out=np.zeros(n)
# drone: D + A, slow swell
for f,a in [(hz(0),0.10),(hz(7),0.06)]:   # one octave up so phone speakers can play it
    out+=a*np.sin(2*np.pi*f*t)*(0.8+0.2*np.sin(2*np.pi*t/9))
# oud-like plucks: decaying harmonics on a slow, stepwise melody
def pluck(f,length=1.6):
    k=np.arange(int(sr*length))/sr
    w=sum(a*np.sin(2*np.pi*f*h*k) for h,a in [(1,1),(2,.5),(3,.28),(4,.14)])
    return w*np.exp(-k*3.2)*0.20
pos=0;beat=0.75;idx=3;seq=[]
while pos<dur-1.8:
    idx=int(np.clip(idx+rng.choice([-2,-1,-1,0,1,1,2]),0,len(scale)-1))
    p=pluck(hz(scale[idx]+12));s=int(pos*sr);out[s:s+len(p)]+=p[:n-s]
    pos+=beat*rng.choice([1,1,2])
# duff: soft frame-drum, pattern dum-tak-.-tak every 3 s cycle
def thump(f0,length=.35,a=.3):
    k=np.arange(int(sr*length))/sr
    return a*np.sin(2*np.pi*(f0*np.exp(-k*8)+55)*k)*np.exp(-k*14)
for i,(off,f,a) in enumerate([(0,140,.30),(.75,240,.16),(1.5,240,.13),(2.25,240,.16)]*int(dur/3)):
    s=int((i//4*3+off)*sr)
    if s<n-sr//2: x=thump(f,a=a);out[s:s+len(x)]+=x
env=np.minimum(1,np.minimum(t/0.6,(dur-t)/0.6))   # fades keep a loop click-free
out*=env; out/=np.abs(out).max()/0.8
wavfile.write(sys.argv[1],sr,(out*32767).astype(np.int16))
print(f"{sys.argv[1]}: {dur:.0f} s")
