pyinstaller --onedir -y serve.py

cd calc_sbpca/python
pyinstaller --onedir -y SAcC.py

cd ../../

mkdir d-dist
rsync -avzP www dist/serve/ calc_sbpca/python/dist/SAcC/ d-dist/
cp stage.py d-dist/

# /Users/rmo/Library/Python/3.6/bin/pyinstaller --windowed -y drift.spec


#hdiutil create d-dist/drift.dmg -volname "Drift" -srcfolder dist/gentle.app/
