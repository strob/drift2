
brew install libsndfile
pip install --user -U -r requirements.txt

git submodule init
git submodule update

cd calc_sbpca
git am ../patches/*.patch